import { Router } from 'express';
import { FavoriteController } from '../favorite/controllers/FavoriteController';

/**
 * 즐겨찾기 라우터 (/api/favorite/*) — 해외법령·국내법 공용(scope로 구분).
 *  - 회원별 북마크: 각 회원은 자기 것만 접근(로그인 게이트는 index.ts 가 /api 전체에 건다).
 */
export class FavoriteHandler {
  public router: Router;
  private c = new FavoriteController();

  constructor() {
    this.router = Router();
    this.router.get('/', this.c.getFavorites);
    this.router.put('/', this.c.putFavorite);
  }
}
