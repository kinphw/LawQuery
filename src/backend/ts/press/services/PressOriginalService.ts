import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { PRESS_FILES_DIR, PRESS_PDF_CACHE_DIR } from '../PressDb';
import { CONVERTIBLE, ConvertJob, OriginalError, pdfConverter } from '../../common/services/PdfConverter';
import type { PressRow } from '../models/PressModel';

export { OriginalError };

/**
 * 원문 보기 — 보도자료 raw 파일(stn-crawler 가 내려받은 PDF·HWP·HWPX)을 브라우저 안에서 PDF 로 보인다.
 * AcctQuery `docs/OriginalService.ts` 를 옮긴 것.
 *
 * - 화면·API 는 문서 id 로만 파일을 가리킨다. 경로는 서버가 `<루트>/<source>/<folder>/<file_name>` 으로 짜고,
 *   루트 밖으로 나가면 열지 않는다(폴더·파일명에 ★「」.. 같은 글자가 섞여 있어 경로를 받지 않는 게 안전하다).
 * - PDF 는 그대로. HWP·HWPX·DOC·DOCX 는 이 PC 의 한/글·워드로 PDF 변환해 캐시에 둔다 —
 *   변환(줄 세우기·실패 기록·긴 경로 회피)은 법령해석 원문과 함께 쓰는 `common/services/PdfConverter` 가 한다.
 */
const DIRECT = new Set(['.pdf']);

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

const jobOf = (r: FileRef, found: { file: string; stat: fs.Stats }): ConvertJob =>
  ({ key: keyOf(r, found.stat), src: found.file, ext: extOf(r), cacheDir: PRESS_PDF_CACHE_DIR });

class PressOriginalService {
  info(r: FileRef): OriginalInfo {
    const found = resolveFile(r);
    if (!found) return { how: 'none', ready: false, size: 0 };
    const ext = extOf(r);
    if (DIRECT.has(ext)) return { how: 'pdf', ready: true, size: found.stat.size };
    if (CONVERTIBLE.has(ext)) {
      if (twinPdf(found.file)) return { how: 'pdf', ready: true, size: found.stat.size };
      return { how: 'convert', ready: pdfConverter.ready(jobOf(r, found)), size: found.stat.size };
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
    if (!CONVERTIBLE.has(ext)) throw new OriginalError(415, '이 형식은 원문 보기를 지원하지 않습니다.');
    return twinPdf(found.file) ?? pdfConverter.pdfFor(jobOf(r, found), retry);
  }
}

export const pressOriginalService = new PressOriginalService();
