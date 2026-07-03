import { Router } from 'express';
import { FavoriteController } from '../favorite/controllers/FavoriteController';
import { authGuard } from '../auth/middleware/authGuard';

/**
 * 즐겨찾기 라우터 (/api/favorite/*) — 해외법령·국내법 공용(scope로 구분).
 *  - 회원별 북마크: 열람·토글 모두 로그인+승인 필수(authGuard). 각 회원은 자기 것만 접근.
 */
export class FavoriteHandler {
  public router: Router;
  private c = new FavoriteController();

  constructor() {
    this.router = Router();
    this.router.get('/', authGuard, this.c.getFavorites);
    this.router.put('/', authGuard, this.c.putFavorite);
  }
}
