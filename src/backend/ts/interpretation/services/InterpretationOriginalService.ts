import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { CONVERTIBLE, OriginalError, pdfConverter } from '../../common/services/PdfConverter';

/**
 * 법령해석·비조치의견서 원문 — 금융법령해석포털의 회신 첨부(HWP·HWPX·PDF)를 브라우저 안에서 PDF 로 보인다.
 *
 * 보관소의 주인은 LawQuery-frc 다(`archive_i.py`·`archive_backfill_i.py`, 규격 interpretation-originals-v1).
 * 웹앱은 읽기만 한다:
 *   <루트>/documents/<자연키해시>.json   (구분, 일련번호) → 포털 상세 주소 + 첨부 목록
 *   <루트>/objects/<sha256>              원본 바이트(내용 해시 이름, 확장자 없음)
 * 자연키해시 = sha256(json.dumps([구분, 일련번호], ensure_ascii=False)) — frc `daily_sync_i.digest` 와 같은 식.
 *
 * - 화면·API 는 (해석 id, 첨부 sha256) 로만 파일을 가리킨다. sha 는 그 문서의 첨부 목록에 있는 것만 받는다.
 * - 변환 캐시 이름은 sha256 그대로 — 내용이 같으면(두 문서가 한 회신서를 공유) 한 번만 변환한다.
 * - 과거해석(2014년 이전)·현장건의 과제는 포털에 첨부가 없어 보관소에도 없다 → 빈 목록.
 * - 로컬(오프라인)판에는 없다 — 이 모듈은 fs 를 쓰므로 localApi 가 부르는 InterpretationController 에서 import 하지 않는다.
 */
export const INTERP_FILES_DIR = path.resolve(
  process.env.INTERP_FILES_DIR || 'C:/projects/LawQuery-frc/data/interpretation_originals');
export const INTERP_PDF_CACHE_DIR = path.resolve(
  process.env.INTERP_PDF_CACHE_DIR || path.join(process.cwd(), 'cache', 'interp-pdf'));

const SHA_RE = /^[0-9a-f]{64}$/;

export interface InterpFile {
  sha: string;
  name: string;
  ext: string;
  size: number;
  /** pdf: 그대로 보임 · convert: 처음 열 때 변환 · none: 내려받기만(미지원 형식) */
  how: 'pdf' | 'convert' | 'none';
  ready: boolean;
}

export interface InterpOriginals {
  /** 포털의 상세 페이지(보관소가 확인한 주소). 보관 기록이 없으면 null. */
  sourceUrl: string | null;
  files: InterpFile[];
}

interface ArchiveDoc {
  source_url?: string;
  attachments?: { original_filename?: string; sha256?: string; size?: number; status?: string }[];
}

const docKey = (kind: string, serial: string) =>
  crypto.createHash('sha256').update(`[${JSON.stringify(kind)}, ${JSON.stringify(serial)}]`, 'utf8').digest('hex');

const objectPath = (sha: string) => path.join(INTERP_FILES_DIR, 'objects', sha);

class InterpretationOriginalService {
  list(kind: string, serial: string): InterpOriginals {
    let doc: ArchiveDoc;
    try {
      doc = JSON.parse(fs.readFileSync(path.join(INTERP_FILES_DIR, 'documents', `${docKey(kind, serial)}.json`), 'utf8'));
    } catch {
      return { sourceUrl: null, files: [] };
    }
    const files: InterpFile[] = [];
    for (const a of doc.attachments ?? []) {
      const sha = a.sha256 ?? '';
      if (a.status !== 'saved' || !SHA_RE.test(sha) || files.some((f) => f.sha === sha)) continue;
      let size: number;
      try { size = fs.statSync(objectPath(sha)).size; } catch { continue; }
      const name = a.original_filename || '첨부';
      const ext = path.extname(name).toLowerCase();
      const convert = CONVERTIBLE.has(ext);
      files.push({
        sha, name, ext: ext.slice(1), size,
        how: ext === '.pdf' ? 'pdf' : convert ? 'convert' : 'none',
        ready: ext === '.pdf' || (convert && pdfConverter.ready(this.job(sha, ext, name))),
      });
    }
    const url = doc.source_url ?? '';
    return { sourceUrl: url.startsWith('https://better.fsc.go.kr/') ? url : null, files };
  }

  private job(sha: string, ext: string, name: string) {
    return { key: sha, src: objectPath(sha), ext, cacheDir: INTERP_PDF_CACHE_DIR, label: name };
  }

  private find(kind: string, serial: string, sha: string): InterpFile {
    const file = SHA_RE.test(sha) ? this.list(kind, serial).files.find((f) => f.sha === sha) : undefined;
    if (!file) throw new OriginalError(404, '원문 파일을 찾지 못했습니다.');
    return file;
  }

  /** 내려받기용 — 원본 그대로(파일명은 포털에 올라온 이름). */
  raw(kind: string, serial: string, sha: string): { file: string; name: string } {
    const f = this.find(kind, serial, sha);
    return { file: objectPath(f.sha), name: f.name };
  }

  /** 보낼 PDF 경로. 필요하면 변환한다. */
  async pdfFor(kind: string, serial: string, sha: string, retry = false): Promise<string> {
    const f = this.find(kind, serial, sha);
    if (f.how === 'pdf') return objectPath(f.sha);
    if (f.how !== 'convert') throw new OriginalError(415, '이 형식은 원문 보기를 지원하지 않습니다.');
    return pdfConverter.pdfFor(this.job(f.sha, `.${f.ext}`, f.name), retry);
  }
}

export const interpretationOriginalService = new InterpretationOriginalService();
