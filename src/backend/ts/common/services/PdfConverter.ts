import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * 원문 → PDF 변환기 (한/글·워드 COM, scripts/to_pdf.py). 보도자료·법령해석 원문 보기가 함께 쓴다.
 *
 * - 변환은 한 번에 하나(한/글 인스턴스 경합 방지) — 그래서 줄(chain)이 이 모듈 하나에만 있어야 한다.
 *   같은 파일 요청은 결과를 공유한다.
 * - 변환할 땐 원본을 캐시 폴더의 짧은 이름(<key>.src.<ext>)으로 복사해 넘긴다 — 원본 경로가 260자를 넘거나
 *   확장자가 없는 저장소(내용 해시 이름)여도 한/글이 열 수 있게.
 * - 변환 실패는 <key>.fail.json 에 남겨 하루 동안 다시 시도하지 않는다(retry 면 다시).
 * - ⚠️ COM 은 사용자 세션에서만 된다. pm2 를 Windows 서비스(Session 0)로 옮기면 변환이 깨진다.
 */
export const PYTHON_BIN = process.env.PYTHON_BIN || 'python';

/** 변환 대상 확장자(점 포함, 소문자). */
export const CONVERTIBLE = new Set(['.hwp', '.hwpx', '.doc', '.docx']);

const FAIL_TTL_MS = 24 * 3600 * 1000;
const TIMEOUT_S = 150;
const SCRIPT = path.join(process.cwd(), 'scripts', 'to_pdf.py');

export class OriginalError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export interface ConvertJob {
  /** 캐시 이름 — 파일 내용이 바뀌면 달라져야 한다. 캐시 폴더 안에서 유일해야 한다. */
  key: string;
  src: string;
  /** 점 포함 소문자 확장자(.hwp 등) — src 에 확장자가 없을 수 있어 따로 받는다. */
  ext: string;
  cacheDir: string;
  /** 로그에 찍을 이름(없으면 src 파일명). */
  label?: string;
}

const cachePdf = (j: ConvertJob) => path.join(j.cacheDir, `${j.key}.pdf`);
const failFile = (j: ConvertJob) => path.join(j.cacheDir, `${j.key}.fail.json`);

class PdfConverter {
  private chain: Promise<unknown> = Promise.resolve();
  private inflight = new Map<string, Promise<string>>();

  /** 이미 변환해 둔 PDF 가 있는가. */
  ready(job: ConvertJob): boolean {
    return fs.existsSync(cachePdf(job));
  }

  /** 변환된 PDF 경로. 없으면 변환한다(첫 변환은 15~35초). */
  async pdfFor(job: ConvertJob, retry = false): Promise<string> {
    const out = cachePdf(job);
    if (fs.existsSync(out)) return out;
    if (!retry && fs.existsSync(failFile(job))) {
      try {
        const f = JSON.parse(fs.readFileSync(failFile(job), 'utf8')) as { at: number; reason: string };
        if (Date.now() - f.at < FAIL_TTL_MS) throw new OriginalError(422, `변환하지 못한 파일입니다: ${f.reason}`);
      } catch (e) {
        if (e instanceof OriginalError) throw e;
      }
    }
    return this.convert(job, out);
  }

  private convert(job: ConvertJob, out: string): Promise<string> {
    const id = out;
    const running = this.inflight.get(id);
    if (running) return running;
    const task = this.chain
      .then(() => this.run(job, out))
      .then(() => {
        try { fs.rmSync(failFile(job), { force: true }); } catch { /* 없으면 그만 */ }
        return out;
      }, (e: unknown) => {
        const reason = e instanceof Error ? e.message : String(e);
        try { fs.writeFileSync(failFile(job), JSON.stringify({ at: Date.now(), reason })); } catch { /* 기록 못 해도 응답은 실패로 */ }
        throw e instanceof OriginalError ? e : new OriginalError(422, reason);
      })
      .finally(() => this.inflight.delete(id));
    this.chain = task.catch(() => undefined);
    this.inflight.set(id, task);
    return task;
  }

  private async run(job: ConvertJob, out: string): Promise<void> {
    fs.mkdirSync(job.cacheDir, { recursive: true });
    const name = job.label || path.basename(job.src);
    const tmpSrc = path.join(job.cacheDir, `${job.key}.src${job.ext}`);
    await fs.promises.copyFile(job.src, tmpSrc);
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
            console.log(`[pdf] 변환 ${secs}초 ${name}`);
            resolve();
          } else {
            console.error(`[pdf] 변환 실패 ${secs}초 code=${code} ${name} ${err.trim().slice(-300)}`);
            reject(new OriginalError(422, err.trim().split('\n').pop()?.slice(0, 200) || `변환기 종료코드 ${code}`));
          }
        });
      });
    } finally {
      try { fs.rmSync(tmpSrc, { force: true }); } catch { /* 남아도 다음 변환이 덮어쓴다 */ }
    }
  }
}

export const pdfConverter = new PdfConverter();
