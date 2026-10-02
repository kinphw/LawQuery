import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { PRESS_FILES_DIR, PRESS_PDF_CACHE_DIR, PYTHON_BIN } from '../PressDb';
import type { PressRow } from '../models/PressModel';

/**
 * 원문 보기 — 보도자료 raw 파일(stn-crawler 가 내려받은 PDF·HWP·HWPX)을 브라우저 안에서 PDF 로 보인다.
 * AcctQuery `docs/OriginalService.ts` 를 옮긴 것.
 *
 * - 화면·API 는 문서 id 로만 파일을 가리킨다. 경로는 서버가 `<루트>/<source>/<folder>/<file_name>` 으로 짜고,
 *   루트 밖으로 나가면 열지 않는다(폴더·파일명에 ★「」.. 같은 글자가 섞여 있어 경로를 받지 않는 게 안전하다).
 * - PDF 는 그대로. HWP·HWPX·DOC·DOCX 는 이 PC 의 한/글·워드로 PDF 변환(scripts/to_pdf.py)해 캐시에 둔다.
 *   변환은 한 번에 하나(한/글 인스턴스 경합 방지), 같은 파일 요청은 결과를 공유한다.
 * - 변환할 땐 원본을 캐시 폴더의 짧은 이름으로 복사해 넘긴다 — 원본 경로가 260자를 넘는 것이 있어(최장 289자)
 *   한/글이 못 연다.
 * - 변환 실패는 <key>.fail.json 에 남겨 하루 동안 다시 시도하지 않는다(retry 면 다시).
 * - ⚠️ COM 은 사용자 세션에서만 된다. pm2 를 Windows 서비스(Session 0)로 옮기면 변환이 깨진다.
 */
const DIRECT = new Set(['.pdf']);
const CONVERT = new Set(['.hwp', '.hwpx', '.doc', '.docx']);
const FAIL_TTL_MS = 24 * 3600 * 1000;
const TIMEOUT_S = 150;
const SCRIPT = path.join(process.cwd(), 'scripts', 'to_pdf.py');

export class OriginalError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export interface OriginalInfo {
  /** pdf: 그대로 보임 · convert: 처음 열 때 변환 · none: 볼 수 없음(파일 없음·미지원 형식) */
  how: 'pdf' | 'convert' | 'none';
  ready: boolean;
  size: number;
}

type FileRef = Pick<PressRow, 'source' | 'source_seq' | 'folder' | 'file_name'>;

const extOf = (r: FileRef) => path.extname(r.file_name).toLowerCase();

/** DB 행 → 실제 파일. 루트 밖이거나 없으면 null. */
function resolveFile(r: FileRef): { file: string; stat: fs.Stats } | null {
  if (!r.folder || !r.file_name) return null;
  const abs = path.resolve(PRESS_FILES_DIR, r.source, r.folder, r.file_name);
  if (!abs.toLowerCase().startsWith(PRESS_FILES_DIR.toLowerCase() + path.sep)) return null;
  try {
    const stat = fs.statSync(abs);
    return stat.isFile() ? { file: abs, stat } : null;
  } catch {
    return null;
  }
}

/**
 * 기관이 HWP 와 함께 올린 같은 이름의 PDF(크롤러가 한 폴더에 받아 둔다). 있으면 변환하지 않고 그걸 보인다.
 * DB 에는 둘 중 하나만 적재돼 있어(pdf > hwpx > hwp) HWP 행이면 대개 없지만, 있으면 15~30초를 아낀다.
 */
function twinPdf(file: string): string | null {
  const twin = file.slice(0, file.length - path.extname(file).length) + '.pdf';
  try { return fs.statSync(twin).isFile() ? twin : null; } catch { return null; }
}

/** 캐시 이름 —파일이 바뀌면(다시 내려받음) 새로 변환되게 크기·수정시각을 섞는다. */
function keyOf(r: FileRef, stat: fs.Stats): string {
  return crypto.createHash('sha1')
    .update([r.source, r.source_seq, r.file_name, stat.size, Math.round(stat.mtimeMs)].join('|'))
    .digest('hex');
}

const cachePdf = (key: string) => path.join(PRESS_PDF_CACHE_DIR, `${key}.pdf`);
const failFile = (key: string) => path.join(PRESS_PDF_CACHE_DIR, `${key}.fail.json`);

class PressOriginalService {
  private chain: Promise<unknown> = Promise.resolve();
  private inflight = new Map<string, Promise<string>>();

  info(r: FileRef): OriginalInfo {
    const found = resolveFile(r);
    if (!found) return { how: 'none', ready: false, size: 0 };
    const ext = extOf(r);
    if (DIRECT.has(ext)) return { how: 'pdf', ready: true, size: found.stat.size };
    if (CONVERT.has(ext)) {
      if (twinPdf(found.file)) return { how: 'pdf', ready: true, size: found.stat.size };
      return { how: 'convert', ready: fs.existsSync(cachePdf(keyOf(r, found.stat))), size: found.stat.size };
    }
    return { how: 'none', ready: false, size: found.stat.size };
  }

  /** 내려받기용 — 원본 파일 그대로. */
  rawFile(r: FileRef): string {
    const found = resolveFile(r);
    if (!found) throw new OriginalError(404, '원문 파일을 찾지 못했습니다.');
    return found.file;
  }

  /** 보낼 PDF 파일 경로. 필요하면 변환한다(첫 변환은 10~20초). */
  async pdfFor(r: FileRef, retry = false): Promise<string> {
    const found = resolveFile(r);
    if (!found) throw new OriginalError(404, '원문 파일을 찾지 못했습니다.');
    const ext = extOf(r);
    if (DIRECT.has(ext)) return found.file;
    if (!CONVERT.has(ext)) throw new OriginalError(415, '이 형식은 원문 보기를 지원하지 않습니다.');
    const twin = twinPdf(found.file);
    if (twin) return twin;

    const key = keyOf(r, found.stat);
    const out = cachePdf(key);
    if (fs.existsSync(out)) return out;
    if (!retry && fs.existsSync(failFile(key))) {
      try {
        const f = JSON.parse(fs.readFileSync(failFile(key), 'utf8')) as { at: number; reason: string };
        if (Date.now() - f.at < FAIL_TTL_MS) throw new OriginalError(422, `변환하지 못한 파일입니다: ${f.reason}`);
      } catch (e) {
        if (e instanceof OriginalError) throw e;
      }
    }
    return this.convert(key, found.file, ext, out);
  }

  private convert(key: string, src: string, ext: string, out: string): Promise<string> {
    const running = this.inflight.get(key);
    if (running) return running;
    const task = this.chain
      .then(() => this.runConverter(key, src, ext, out))
      .then(() => {
        try { fs.rmSync(failFile(key), { force: true }); } catch { /* 없으면 그만 */ }
        return out;
      }, (e: unknown) => {
        const reason = e instanceof Error ? e.message : String(e);
        try { fs.writeFileSync(failFile(key), JSON.stringify({ at: Date.now(), reason })); } catch { /* 기록 못 해도 응답은 실패로 */ }
        throw e instanceof OriginalError ? e : new OriginalError(422, reason);
      })
      .finally(() => this.inflight.delete(key));
    this.chain = task.catch(() => undefined);
    this.inflight.set(key, task);
    return task;
  }

  private async runConverter(key: string, src: string, ext: string, out: string): Promise<void> {
    fs.mkdirSync(PRESS_PDF_CACHE_DIR, { recursive: true });
    const tmpSrc = path.join(PRESS_PDF_CACHE_DIR, `${key}.src${ext}`);
    await fs.promises.copyFile(src, tmpSrc);
    const started = Date.now();
    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(PYTHON_BIN, [SCRIPT, tmpSrc, out, '--timeout', String(TIMEOUT_S)], {
          env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
          windowsHide: true,
        });
        let err = '';
        child.stderr.on('data', (b: Buffer) => { err += b.toString('utf8'); });
        const killer = setTimeout(() => child.kill(), (TIMEOUT_S + 30) * 1000);
        child.on('error', (e) => { clearTimeout(killer); reject(new OriginalError(500, `변환기를 실행하지 못했습니다(${e.message})`)); });
        child.on('close', (code) => {
          clearTimeout(killer);
          const secs = ((Date.now() - started) / 1000).toFixed(1);
          if (code === 0 && fs.existsSync(out)) {
            console.log(`[press] 변환 ${secs}초 ${path.basename(src)}`);
            resolve();
          } else {
            console.error(`[press] 변환 실패 ${secs}초 code=${code} ${path.basename(src)} ${err.trim().slice(-300)}`);
            reject(new OriginalError(422, err.trim().split('\n').pop()?.slice(0, 200) || `변환기 종료코드 ${code}`));
          }
        });
      });
    } finally {
      try { fs.rmSync(tmpSrc, { force: true }); } catch { /* 남아도 다음 변환이 덮어쓴다 */ }
    }
  }
}

export const pressOriginalService = new PressOriginalService();
