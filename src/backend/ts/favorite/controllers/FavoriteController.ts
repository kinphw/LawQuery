import { Request, Response } from 'express';
import { FavoriteModel, FavoriteScope } from '../models/FavoriteModel';

/**
 * 즐겨찾기(favorite) 통합 컨트롤러 — 로그인 회원별(북마크).
 *  - 라우터에서 authGuard 적용 → req.member.id 로 소유자 판정(회원별 격리).
 *  - GET  /api/favorite?scope=&code=   : 그 회원의 (scope, law_code) node_key 목록
 *  - PUT  /api/favorite                : { scope, law_code, node_key, on } 토글
 */
const SCOPES: FavoriteScope[] = ['foreign', 'law'];
function parseScope(v: any): FavoriteScope | null {
  const s = String(v || '').trim();
  return (SCOPES as string[]).includes(s) ? (s as FavoriteScope) : null;
}

export class FavoriteController {
  private model = new FavoriteModel();

  getFavorites = async (req: Request, res: Response): Promise<void> => {
    const memberId = req.member?.id;
    const scope = parseScope(req.query.scope);
    const lawCode = String(req.query.code || '').trim();
    if (!memberId) { res.status(401).json({ success: false, error: '로그인이 필요합니다.' }); return; }
    if (!scope || !lawCode) {
      res.status(400).json({ success: false, error: 'scope, code 파라미터가 필요합니다.' });
      return;
    }
    try {
      const keys = await this.model.getFavorites(memberId, scope, lawCode);
      res.status(200).json({ success: true, data: keys }); // ["<node_key>", …]
    } catch (e) {
      console.error('[favorite] getFavorites', e);
      res.status(500).json({ success: false, error: '즐겨찾기 조회 실패' });
    }
  };

  /** 즐겨찾기 토글. on=true 추가 / on=false 삭제. 로그인 회원 전용(authGuard). */
  putFavorite = async (req: Request, res: Response): Promise<void> => {
    const memberId = req.member?.id;
    const scope = parseScope(req.body?.scope);
    const lawCode = String(req.body?.law_code || '').trim();
    const nodeKey = String(req.body?.node_key || '').trim();
    const on = req.body?.on === true || req.body?.on === 'true';
    if (!memberId) { res.status(401).json({ success: false, error: '로그인이 필요합니다.' }); return; }
    if (!scope || !lawCode || !nodeKey) {
      res.status(400).json({ success: false, error: 'scope, law_code, node_key가 필요합니다.' });
      return;
    }
    try {
      if (on) await this.model.addFavorite(memberId, scope, lawCode, nodeKey);
      else await this.model.removeFavorite(memberId, scope, lawCode, nodeKey);
      res.status(200).json({ success: true, on });
    } catch (e) {
      console.error('[favorite] putFavorite', e);
      res.status(500).json({ success: false, error: '즐겨찾기 저장 실패' });
    }
  };
}
