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

  // ── 메모(PRO 전용) ──────────────────────────────────────────────────────────
  getMemos = async (req: Request, res: Response): Promise<void> => {
    const code = String(req.query.code || '').trim();
    if (!code) {
      res.status(400).json({ success: false, error: 'code 파라미터가 필요합니다.' });
      return;
    }
    try {
      const rows = await this.model.getMemos(req.member!.id, code);
      // 프론트가 쓰기 쉽도록 { provision_id: memo } 맵으로 변환
      const map: Record<number, string> = {};
      rows.forEach(r => { map[r.provision_id] = r.memo; });
      res.status(200).json({ success: true, data: map });
    } catch (e) {
      console.error('[foreign] getMemos', e);
      res.status(500).json({ success: false, error: '메모 조회 실패' });
    }
  };

  /** 메모 저장(upsert). 빈 문자열이면 삭제로 처리. */
  putMemo = async (req: Request, res: Response): Promise<void> => {
    const provisionId = Number(req.body?.provision_id || 0);
    const lawCode = String(req.body?.law_code || '').trim();
    const memo = typeof req.body?.memo === 'string' ? req.body.memo : '';
    if (!provisionId || !lawCode) {
      res.status(400).json({ success: false, error: 'provision_id, law_code가 필요합니다.' });
      return;
    }
    try {
      if (!memo.trim()) {
        await this.model.deleteMemo(req.member!.id, provisionId);
        res.status(200).json({ success: true, deleted: true });
        return;
      }
      await this.model.upsertMemo(req.member!.id, provisionId, lawCode, memo);
      res.status(200).json({ success: true });
    } catch (e) {
      console.error('[foreign] putMemo', e);
      res.status(500).json({ success: false, error: '메모 저장 실패' });
    }
  };

  deleteMemo = async (req: Request, res: Response): Promise<void> => {
    const provisionId = Number(req.query.provision_id || 0);
    if (!provisionId) {
      res.status(400).json({ success: false, error: 'provision_id가 필요합니다.' });
      return;
    }
    try {
      await this.model.deleteMemo(req.member!.id, provisionId);
      res.status(200).json({ success: true });
    } catch (e) {
      console.error('[foreign] deleteMemo', e);
      res.status(500).json({ success: false, error: '메모 삭제 실패' });
    }
  };
}
