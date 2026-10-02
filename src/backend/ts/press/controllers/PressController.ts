import { Request, Response } from 'express';
import fs from 'fs';
import { PressModel, PressCriteria, PressIn, PRESS_SOURCES } from '../models/PressModel';
import { pressOriginalService, OriginalError } from '../services/PressOriginalService';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TOKENS = 5;
const PAGE_SIZE = 40;

/** 기관 사이트의 게시물 주소(확인된 기관만). */
function postUrl(source: string, seq: string): string | null {
  if (source === 'fsc') return `https://www.fsc.go.kr/no010101/${encodeURIComponent(seq)}`;
  if (source === 'fss') return `https://www.fss.or.kr/fss/bbs/B0000188/view.do?nttId=${encodeURIComponent(seq)}&menuNo=200218`;
  return null;
}

export class PressController {
  private model = new PressModel();

  private criteria(req: Request): PressCriteria {
    const q = String(req.query.q ?? '').trim();
    // phrase=1 이면 띄어쓰기를 포함한 문구 통째로, 아니면 띄어 쓴 낱말이 모두 들어간 것(AND)
    const phrase = req.query.phrase === '1';
    const tokens = !q ? [] : phrase
      ? [q.replace(/\s+/g, ' ')].filter((t) => t.length >= 2)
      : q.split(/\s+/).filter((t) => t.length >= 2).slice(0, MAX_TOKENS);
    if (q && !tokens.length) throw new OriginalError(400, '검색어는 두 글자 이상으로 입력하세요.');
    const w = String(req.query.in ?? 'all');
    const where: PressIn = w === 'title' || w === 'body' ? w : 'all';
    const sources = String(req.query.source ?? '').split(',').map((s) => s.trim()).filter((s) => s in PRESS_SOURCES);
    const from = String(req.query.from ?? '');
    const to = String(req.query.to ?? '');
    return { tokens, where, sources, from: DATE_RE.test(from) ? from : undefined, to: DATE_RE.test(to) ? to : undefined };
  }

  private fail(res: Response, e: unknown, what: string): void {
    if (e instanceof OriginalError) {
      res.status(e.status).json({ success: false, error: e.message });
      return;
    }
    console.error(`[press] ${what}`, e);
    res.status(500).json({ success: false, error: '보도자료 DB 를 읽지 못했습니다.' });
  }

  async sources(req: Request, res: Response): Promise<void> {
    try {
      res.json({ success: true, sources: await this.model.sources() });
    } catch (e) { this.fail(res, e, 'sources'); }
  }

  async search(req: Request, res: Response): Promise<void> {
    try {
      const c = this.criteria(req);
      const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
      const { items, more } = await this.model.search(c, page, PAGE_SIZE);
      res.json({ success: true, tokens: c.tokens, page, more, items });
    } catch (e) { this.fail(res, e, 'search'); }
  }

  async count(req: Request, res: Response): Promise<void> {
    try {
      res.json({ success: true, ...(await this.model.count(this.criteria(req))) });
    } catch (e) { this.fail(res, e, 'count'); }
  }

  /** 문서 한 건: 메타 + 추출 본문 + 같은 게시물의 파일들(원문 보기 가능 여부 포함). */
  async doc(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id)) throw new OriginalError(400, '올바른 문서 번호가 아닙니다.');
      const row = await this.model.row(id);
      if (!row) throw new OriginalError(404, '문서를 찾지 못했습니다.');
      const [content, siblings] = await Promise.all([this.model.content(id), this.model.siblings(row.source, row.source_seq)]);
      res.json({
        success: true,
        doc: {
          id: row.id,
          source: row.source,
          sourceName: PRESS_SOURCES[row.source] ?? row.source,
          date: row.published_date,
          title: row.post_title || row.file_name,
          fileName: row.file_name,
          postUrl: postUrl(row.source, row.source_seq),
          // 기관 사이트의 첨부 내려받기 주소 — raw 파일이 이 PC 에 없을 때(행만 넘어온 수집분) 화면이 대신 안내한다
          fileUrl: /^https?:\/\//.test(row.file_url || '') ? row.file_url : null,
          content,
        },
        files: siblings.map((s) => ({
          id: s.id,
          name: s.file_name,
          ext: (s.file_ext || '').toLowerCase(),
          chars: Number(s.char_count) || 0,
          ...pressOriginalService.info(s),
        })),
      });
    } catch (e) { this.fail(res, e, 'doc'); }
  }

  /** 원문 파일 — 기본은 PDF(필요하면 변환), raw=1 이면 원본 그대로 내려받기. */
  async original(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id)) throw new OriginalError(400, '올바른 문서 번호가 아닙니다.');
      const row = await this.model.row(id);
      if (!row) throw new OriginalError(404, '문서를 찾지 못했습니다.');
      const raw = req.query.raw === '1';
      const file = raw ? pressOriginalService.rawFile(row) : await pressOriginalService.pdfFor(row, req.query.retry === '1');
      const stat = await fs.promises.stat(file);
      res.setHeader('Content-Length', String(stat.size));
      res.setHeader('Cache-Control', 'private, max-age=86400');
      if (raw) {
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(row.file_name)}`);
      } else {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline');
      }
      fs.createReadStream(file)
        .on('error', () => { if (!res.headersSent) res.status(500).end(); else res.destroy(); })
        .pipe(res);
    } catch (e) { this.fail(res, e, 'original'); }
  }
}
