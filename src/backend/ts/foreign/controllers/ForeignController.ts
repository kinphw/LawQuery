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
      // 관리자면 교정 가능(환경 무관 — 교정은 오버레이라 이관에 안 지워짐).
      const isAdmin = req.member?.role === 'admin';
      // 교정 오버레이를 '원문 지문'으로 검증하며 베이스 위에 덮는다(원본은 fin_law_db 그대로).
      //   재적재로 seg_index 가 밀렸어도 지문이 일치하는 seg 를 찾아 자가 치유하고,
      //   원문 자체가 분리/변경돼 못 찾으면 적용하지 않는다(조용한 오염 차단) — 관리자에겐 재확인 뱃지.
      const overrides = await this.model.getOverrides(code);
      if (Object.keys(overrides).length) {
        // 지문 인덱스는 오버레이가 있는 조로 한정(대형 법령서 전체 seg 해시 회피).
        const arts = new Set(Object.keys(overrides).map(k => k.slice(0, k.indexOf('|'))));
        const idx = ForeignModel.buildAnchorIndex(provisions.filter(p => arts.has(p.article_no)));
        const byKey = new Map<string, typeof provisions[number]>();
        for (const p of provisions) byKey.set(`${p.article_no}|${p.seg_index}`, p);
        const editableFields = ForeignModel.EDITABLE_FIELDS as readonly string[];
        for (const key of Object.keys(overrides)) {
          const sep1 = key.indexOf('|'), sep2 = key.indexOf('|', sep1 + 1);
          const art = key.slice(0, sep1);
          const storedIdx = Number(key.slice(sep1 + 1, sep2));
          const field = key.slice(sep2 + 1);
          if (!editableFields.includes(field)) continue;
          const cell = overrides[key];
          const targetIdx = ForeignModel.resolveAnchor(art, storedIdx, cell.anchor_hash, idx);
          if (targetIdx == null) {
            // 억제(원문 드리프트). 관리자에겐 원래 위치에 '재확인' 뱃지 + 이전 교정값.
            if (isAdmin) {
              const p = byKey.get(`${art}|${storedIdx}`);
              if (p) (p.review ||= []).push({ field, kind: 'stale', prev: cell.value });
            }
            continue;
          }
          const p = byKey.get(`${art}|${targetIdx}`);
          if (!p) continue;
          (p as any)[field] = cell.value;
          // '수정됨' 표시 + X 되돌리기 대상(상류 변경을 가림). legacy(지문없음)도 '수정됨'으로 충분히
          // 드러나므로 별도 '미검증' 뱃지는 달지 않는다(대량 구행 이중뱃지 노이즈 방지).
          if (isAdmin) (p.overridden ||= []).push(field);
        }
      }
      res.status(200).json({ success: true, data: { meta, provisions, editable: isAdmin } });
    } catch (e) {
      console.error('[foreign] getProvisions', e);
      res.status(500).json({ success: false, error: '해외법령 조회 실패' });
    }
  };

  /**
   * 일본법 하위규정 연계(자동 추출). code 의 각 조별 { refs(인용), citedBy(피인용) }.
   * 무료 공개(optionalAuth). 비 일본법·연계없음이면 빈 맵.
   */
  getLinks = async (req: Request, res: Response): Promise<void> => {
    const code = String(req.query.code || '').trim();
    if (!code) {
      res.status(400).json({ success: false, error: 'code 파라미터가 필요합니다.' });
      return;
    }
    try {
      const data = await this.model.getLinks(code);
      res.status(200).json({ success: true, data });
    } catch (e) {
      console.error('[foreign] getLinks', e);
      res.status(500).json({ success: false, error: '연계 조회 실패' });
    }
  };

  /**
   * 일본 결제법 계열 3단 연계표(법→시행령→부령[트랙]). family=jp_epi|jp_funds.
   * 무료 공개(optionalAuth). 미지원 family면 404.
   */
  getLinkTable = async (req: Request, res: Response): Promise<void> => {
    const family = String(req.query.family || '').trim();
    const rel = req.query.rel === 'all' ? 'all' : 'deleg';
    if (!family) {
      res.status(400).json({ success: false, error: 'family 파라미터가 필요합니다.' });
      return;
    }
    try {
      const data = await this.model.getLinkTable(family, rel);
      if (!data) {
        res.status(404).json({ success: false, error: '지원하지 않는 계열입니다.' });
        return;
      }
      res.status(200).json({ success: true, data });
    } catch (e) {
      console.error('[foreign] getLinkTable', e);
      res.status(500).json({ success: false, error: '연계표 조회 실패' });
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
      // 편집 시점 그 seg 의 현재 base 원문 지문을 함께 저장 → 이후 재적재 드리프트 감지·자가치유.
      const anchorHash = await this.model.getBaseAnchor(code, articleNo, segIndex);
      const effective: Record<string, string | null> = {};
      for (const f of fields) {
        const raw = (req.body as any)[f];
        const val = (typeof raw === 'string' ? raw : (raw == null ? '' : String(raw)));
        if (val.trim() === '') {
          await this.model.deleteOverride(code, articleNo, segIndex, f); // 원본 복귀
          effective[f] = await this.model.getBaseField(code, articleNo, segIndex, f);
        } else {
          await this.model.upsertOverride(code, articleNo, segIndex, f, val, anchorHash);
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
      // 교정과 동일하게 지문으로 검증·자가치유 후, 살아남은 메모만 실효 위치 키로 평탄화.
      //   프론트 계약은 { "<article_no>|<seg_index>": memo } 유지(원문 드리프트로 억제된 메모는 제외).
      const raw = await this.model.getMemos(code);
      const map: Record<string, string> = {};
      if (Object.keys(raw).length) {
        const arts = new Set(Object.keys(raw).map(k => k.slice(0, k.indexOf('|'))));
        const idx = ForeignModel.buildAnchorIndex((await this.model.getBaseSegRows(code)).filter(r => arts.has(r.article_no)));
        for (const key of Object.keys(raw)) {
          const sep = key.indexOf('|');
          const art = key.slice(0, sep);
          const storedIdx = Number(key.slice(sep + 1));
          const cell = raw[key];
          const targetIdx = ForeignModel.resolveAnchor(art, storedIdx, cell.anchor_hash, idx);
          if (targetIdx == null) continue; // 억제(원문 드리프트)
          if (cell.anchor_hash == null && !idx.hashAt.has(`${art}|${storedIdx}`)) continue; // 레거시인데 위치 사라짐
          map[`${art}|${targetIdx}`] = cell.memo;
        }
      }
      res.status(200).json({ success: true, data: map });
    } catch (e) {
      console.error('[foreign] getMemos', e);
      res.status(500).json({ success: false, error: '메모 조회 실패' });
    }
  };

  /**
   * 재적재 후 교정·메모를 현재 베이스에 재정착(seg_index 갱신) + 고아 리포트. 운영자 전용(adminGuard).
   * 조회는 이미 지문으로 자가치유되므로 필수는 아니나, 이관/재적재 뒤 '교정이 다 살아남았는지'
   * 확인·정리하는 용도. body: { code }.
   */
  reanchor = async (req: Request, res: Response): Promise<void> => {
    const code = String(req.body?.code || req.body?.law_code || '').trim();
    if (!code) {
      res.status(400).json({ success: false, error: 'code 파라미터가 필요합니다.' });
      return;
    }
    try {
      const report = await this.model.reanchor(code);
      res.status(200).json({ success: true, data: report });
    } catch (e) {
      console.error('[foreign] reanchor', e);
      res.status(500).json({ success: false, error: '재정착 실패' });
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
      const anchorHash = await this.model.getBaseAnchor(lawCode, articleNo, segIndex);
      await this.model.upsertMemo(lawCode, articleNo, segIndex, memo, anchorHash);
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
}
