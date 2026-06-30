import { Request, Response } from 'express';
import { ForeignModel } from '../models/ForeignModel';

/** 인라인 수정 허용 환경(개발계 전용). 운영(production)에서는 직접 편집을 막고 허브 이관으로만 반영. */
function adminEditAllowed(): boolean {
  return process.env.NODE_ENV !== 'production';
}

/**
 * 해외법령 조회 + 개인 메모.
 *  - list / provisions : 본문(원문·번역). 무료 공개(optionalAuth).
 *  - memo (GET/PUT/DELETE) : 개인 주석. PRO 전용(proGuard) — 라우터에서 게이트 적용.
 *  - admin/provision (PUT) : 관리자 본문 인라인 수정. 개발계 전용(adminGuard + production 차단).
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
      // 관리자 + 개발계일 때만 인라인 수정 노출(프론트가 '수정' UI 분기에 사용).
      const editable = req.member?.role === 'admin' && adminEditAllowed();
      res.status(200).json({ success: true, data: { meta, provisions, editable } });
    } catch (e) {
      console.error('[foreign] getProvisions', e);
      res.status(500).json({ success: false, error: '해외법령 조회 실패' });
    }
  };

  // ── 관리자 본문 인라인 수정(개발계 전용) ───────────────────────────────────────
  /**
   * 물리 provision_id 의 원문/번역/제목을 수정.
   * 게이트: 라우터 adminGuard(관리자) + 여기서 production 차단(개발계에서만 직접 편집 → 허브 이관으로 운영 반영).
   */
  updateProvision = async (req: Request, res: Response): Promise<void> => {
    if (!adminEditAllowed()) {
      res.status(403).json({
        success: false,
        error: '운영에서는 직접 수정할 수 없습니다. 개발계에서 수정 후 이관해 주세요.',
        code: 'EDIT_DISABLED',
      });
      return;
    }
    const provisionId = Number(req.body?.provision_id);
    if (!Number.isInteger(provisionId) || provisionId <= 0) {
      res.status(400).json({ success: false, error: 'provision_id가 필요합니다.' });
      return;
    }
    // 화이트리스트 컬럼 중 요청에 담긴 것만 추림.
    const fields: Record<string, string | null> = {};
    for (const c of ForeignModel.EDITABLE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, c)) {
        const v = (req.body as any)[c];
        fields[c] = typeof v === 'string' ? v : (v == null ? '' : String(v));
      }
    }
    if (!Object.keys(fields).length) {
      res.status(400).json({ success: false, error: '수정할 필드가 없습니다.' });
      return;
    }
    try {
      const affected = await this.model.updateProvision(provisionId, fields);
      if (!affected) {
        res.status(404).json({ success: false, error: '해당 조문을 찾을 수 없습니다.' });
        return;
      }
      res.status(200).json({ success: true });
    } catch (e) {
      console.error('[foreign] updateProvision', e);
      res.status(500).json({ success: false, error: '수정 저장 실패 (개발계 UPDATE 권한을 확인하세요)' });
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
