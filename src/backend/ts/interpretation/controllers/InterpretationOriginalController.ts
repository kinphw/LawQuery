import { Request, Response } from 'express';
import fs from 'fs';
import { InterpretationModel } from '../models/InterpretationModel';
import { OriginalError } from '../../common/services/PdfConverter';
import { interpretationOriginalService } from '../services/InterpretationOriginalService';

/**
 * 법령해석 원문(포털 회신 첨부) — 목록과 파일.
 * InterpretationController 와 따로 둔다: 저쪽은 로컬(오프라인)판이 브라우저에서 그대로 부르는데 이쪽은 fs 를 쓴다.
 */
export class InterpretationOriginalController {
  private model = new InterpretationModel();

  private async keyOf(req: Request): Promise<{ kind: string; serial: string }> {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) throw new OriginalError(400, '올바른 ID 형식이 아닙니다.');
    const key = await this.model.getKey(id);
    if (!key) throw new OriginalError(404, '해당 ID의 데이터를 찾을 수 없습니다.');
    return key;
  }

  private fail(res: Response, e: unknown, what: string): void {
    if (e instanceof OriginalError) {
      res.status(e.status).json({ success: false, error: e.message });
      return;
    }
    console.error(`[interpretation] ${what}`, e);
    res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
  }

  /** 이 해석의 원문 파일들(원문 보기 가능 여부 포함)과 포털 상세 주소. */
  async files(req: Request, res: Response): Promise<void> {
    try {
      const { kind, serial } = await this.keyOf(req);
      res.json({ success: true, ...interpretationOriginalService.list(kind, serial) });
    } catch (e) { this.fail(res, e, 'files'); }
  }

  /** 원문 파일 — 기본은 PDF(필요하면 변환), raw=1 이면 원본 그대로 내려받기. */
  async original(req: Request, res: Response): Promise<void> {
    try {
      const { kind, serial } = await this.keyOf(req);
      const sha = String(req.params.sha);
      const raw = req.query.raw === '1';
      const got = raw ? interpretationOriginalService.raw(kind, serial, sha) : null;
      const file = got ? got.file : await interpretationOriginalService.pdfFor(kind, serial, sha, req.query.retry === '1');
      const stat = await fs.promises.stat(file);
      res.setHeader('Content-Length', String(stat.size));
      res.setHeader('Cache-Control', 'private, max-age=86400');
      if (got) {
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(got.name)}`);
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
