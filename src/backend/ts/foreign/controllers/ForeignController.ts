import { Request, Response } from 'express';
import { ForeignModel } from '../models/ForeignModel';

/**
 * 해외법령 조회 + 메모 + 본문 교정.
 *  - list / provisions : 본문(원문·번역 + 교정 오버레이 병합). 무료 공개(optionalAuth).
 *  - memo (GET/PUT/DELETE) : 운영자 큐레이션(열람 공개 / 작성 admin).
 *  - admin/override (PUT) : 관리자 본문 교정. adminGuard. 원본은 보존, 교정은 ldb_auth 레이어에 저장
 *    (운영에서도 안전 — 이관이 안 건드림). 되돌리기 = 빈 값 저장(원본 복귀).
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
      // 교정 오버레이를 베이스 위에 덮어 표시(원본은 fin_law_db 그대로).
      const overrides = await this.model.getOverrides(code);
      if (Object.keys(overrides).length) {
        for (const p of provisions) {
          for (const f of ForeignModel.EDITABLE_FIELDS) {
            const v = overrides[`${p.article_no}|${p.seg_index}|${f}`];
            if (v !== undefined) (p as any)[f] = v;
          }
        }
      }
      // 관리자면 교정 가능(환경 무관 — 교정은 오버레이라 이관에 안 지워짐).
      const editable = req.member?.role === 'admin';
      res.status(200).json({ success: true, data: { meta, provisions, editable } });
    } catch (e) {
      console.error('[foreign] getProvisions', e);
      res.status(500).json({ success: false, error: '해외법령 조회 실패' });
    }
  };

  // ── 관리자 본문 교정(오버레이) ────────────────────────────────────────────────
  /**
   * 조문(논리키 code/article_no/seg_index)의 원문/번역/제목을 교정 레이어에 저장.
   * 값이 있으면 upsert, 빈 문자열이면 delete(원본 복귀). 원본(fin_law_db)은 건드리지 않는다.
   * 응답 effective 는 저장 후 실효값(upsert=교정값, delete=원본값) — 프론트가 그 값으로 셀 갱신.
   * 게이트: 라우터 adminGuard(관리자). 환경 무관(교정은 이관에 안 지워짐).
   */
  saveOverride = async (req: Request, res: Response): Promise<void> => {
    const code = String(req.body?.law_code || '').trim();
    const articleNo = String(req.body?.article_no || '').trim();
    const segIndex = Number(req.body?.seg_index || 0);
    if (!code || !articleNo || !segIndex) {
      res.status(400).json({ success: false, error: 'law_code, article_no, seg_index가 필요합니다.' });
      return;
    }
    // 화이트리스트 컬럼 중 요청에 담긴 것만 추림.
    const fields: string[] = ForeignModel.EDITABLE_FIELDS.filter(
      c => Object.prototype.hasOwnProperty.call(req.body || {}, c)
    );
    if (!fields.length) {
      res.status(400).json({ success: false, error: '수정할 필드가 없습니다.' });
      return;
    }
    try {
      const effective: Record<string, string | null> = {};
      for (const f of fields) {
        const raw = (req.body as any)[f];
        const val = (typeof raw === 'string' ? raw : (raw == null ? '' : String(raw)));
        if (val.trim() === '') {
          await this.model.deleteOverride(code, articleNo, segIndex, f); // 원본 복귀
          effective[f] = await this.model.getBaseField(code, articleNo, segIndex, f);
        } else {
          await this.model.upsertOverride(code, articleNo, segIndex, f, val);
          effective[f] = val;
        }
      }
      res.status(200).json({ success: true, effective });
    } catch (e) {
      console.error('[foreign] saveOverride', e);
      res.status(500).json({ success: false, error: '교정 저장 실패' });
    }
  };

  // ── 메모(운영자 큐레이션, 전역) — 논리키 (code, article_no, seg_index) ──────────
  //    열람=공개(optionalAuth), 작성/삭제=운영자(adminGuard) — 라우터에서 게이트 적용.
  getMemos = async (req: Request, res: Response): Promise<void> => {
    const code = String(req.query.code || '').trim();
    if (!code) {
      res.status(400).json({ success: false, error: 'code 파라미터가 필요합니다.' });
      return;
    }
    try {
      const map = await this.model.getMemos(code);
      res.status(200).json({ success: true, data: map }); // { "<article_no>|<seg_index>": memo }
    } catch (e) {
      console.error('[foreign] getMemos', e);
      res.status(500).json({ success: false, error: '메모 조회 실패' });
    }
  };

  /** 메모 저장(upsert). 빈 문자열이면 삭제로 처리. 운영자 전용(adminGuard). */
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
        await this.model.deleteMemo(lawCode, articleNo, segIndex);
        res.status(200).json({ success: true, deleted: true });
        return;
      }
      await this.model.upsertMemo(lawCode, articleNo, segIndex, memo);
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
      await this.model.deleteMemo(lawCode, articleNo, segIndex);
      res.status(200).json({ success: true });
    } catch (e) {
      console.error('[foreign] deleteMemo', e);
      res.status(500).json({ success: false, error: '메모 삭제 실패' });
    }
  };

  // ── 즐겨찾기(운영자 개인 강조표시) — 논리키 (code, article_no, seg_index) ─────────
  //    열람·토글 모두 운영자 전용(adminGuard) — 강조색은 운영자에게만 노출.
  getFavorites = async (req: Request, res: Response): Promise<void> => {
    const code = String(req.query.code || '').trim();
    if (!code) {
      res.status(400).json({ success: false, error: 'code 파라미터가 필요합니다.' });
      return;
    }
    try {
      const keys = await this.model.getFavorites(code);
      res.status(200).json({ success: true, data: keys }); // ["<article_no>|<seg_index>", …]
    } catch (e) {
      console.error('[foreign] getFavorites', e);
      res.status(500).json({ success: false, error: '즐겨찾기 조회 실패' });
    }
  };

  /** 즐겨찾기 토글. on=true 추가 / on=false 삭제. 운영자 전용(adminGuard). */
  putFavorite = async (req: Request, res: Response): Promise<void> => {
    const lawCode = String(req.body?.law_code || '').trim();
    const articleNo = String(req.body?.article_no || '').trim();
    const segIndex = Number(req.body?.seg_index || 0);
    const on = req.body?.on === true || req.body?.on === 'true';
    if (!lawCode || !articleNo || !segIndex) {
      res.status(400).json({ success: false, error: 'law_code, article_no, seg_index가 필요합니다.' });
      return;
    }
    try {
      if (on) await this.model.addFavorite(lawCode, articleNo, segIndex);
      else await this.model.removeFavorite(lawCode, articleNo, segIndex);
      res.status(200).json({ success: true, on });
    } catch (e) {
      console.error('[foreign] putFavorite', e);
      res.status(500).json({ success: false, error: '즐겨찾기 저장 실패' });
    }
  };
}
