import { Request, Response } from 'express';
import { ForeignModel } from '../models/ForeignModel';

/**
 * 해외법령 조회 + 개인 메모.
 *  - list / provisions : 본문(원문·번역). 무료 공개(optionalAuth).
 *  - memo (GET/PUT/DELETE) : 개인 주석. PRO 전용(proGuard) — 라우터에서 게이트 적용.
 */
export class ForeignController {
  private model = new ForeignModel();

  getList = async (_req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.model.listLaws();
      res.status(200).json({ success: true, data });
    } catch (e) {
      console.error('[foreign] getList', e);
      res.status(500).json({ success: false, error: '해외법령 목록 조회 실패' });
    }
  };

  getProvisions = async (req: Request, res: Response): Promise<void> => {
    const code = String(req.query.code || '').trim();
    if (!code) {
      res.status(400).json({ success: false, error: 'code 파라미터가 필요합니다.' });
      return;
    }
    try {
      const meta = await this.model.getLawMeta(code);
      if (!meta) {
        res.status(404).json({ success: false, error: '해당 법령을 찾을 수 없습니다.' });
        return;
      }
      const provisions = await this.model.getProvisions(code);
      res.status(200).json({ success: true, data: { meta, provisions } });
    } catch (e) {
      console.error('[foreign] getProvisions', e);
      res.status(500).json({ success: false, error: '해외법령 조회 실패' });
    }
  };

  // ── 메모(PRO 전용) — 논리키 (code, article_no, seg_index) ────────────────────
  getMemos = async (req: Request, res: Response): Promise<void> => {
    const code = String(req.query.code || '').trim();
    if (!code) {
      res.status(400).json({ success: false, error: 'code 파라미터가 필요합니다.' });
      return;
    }
    try {
      const map = await this.model.getMemos(req.member!.id, code);
      res.status(200).json({ success: true, data: map }); // { "<article_no>|<seg_index>": memo }
    } catch (e) {
      console.error('[foreign] getMemos', e);
      res.status(500).json({ success: false, error: '메모 조회 실패' });
    }
  };

  /** 메모 저장(upsert). 빈 문자열이면 삭제로 처리. */
  putMemo = async (req: Request, res: Response): Promise<void> => {
    const lawCode = String(req.body?.law_code || '').trim();
    const articleNo = String(req.body?.article_no || '').trim();
    const segIndex = Number(req.body?.seg_index || 0);
    const memo = typeof req.body?.memo === 'string' ? req.body.memo : '';
    if (!lawCode || !articleNo || !segIndex) {
      res.status(400).json({ success: false, error: 'law_code, article_no, seg_index가 필요합니다.' });
      return;
    }
    try {
      if (!memo.trim()) {
        await this.model.deleteMemo(req.member!.id, lawCode, articleNo, segIndex);
        res.status(200).json({ success: true, deleted: true });
        return;
      }
      await this.model.upsertMemo(req.member!.id, lawCode, articleNo, segIndex, memo);
      res.status(200).json({ success: true });
    } catch (e) {
      console.error('[foreign] putMemo', e);
      res.status(500).json({ success: false, error: '메모 저장 실패' });
    }
  };

  deleteMemo = async (req: Request, res: Response): Promise<void> => {
    const lawCode = String(req.query.code || '').trim();
    const articleNo = String(req.query.article_no || '').trim();
    const segIndex = Number(req.query.seg_index || 0);
    if (!lawCode || !articleNo || !segIndex) {
      res.status(400).json({ success: false, error: 'code, article_no, seg_index가 필요합니다.' });
      return;
    }
    try {
      await this.model.deleteMemo(req.member!.id, lawCode, articleNo, segIndex);
      res.status(200).json({ success: true });
    } catch (e) {
      console.error('[foreign] deleteMemo', e);
      res.status(500).json({ success: false, error: '메모 삭제 실패' });
    }
  };
}
