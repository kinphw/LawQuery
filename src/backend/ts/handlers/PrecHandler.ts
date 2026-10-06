import { Router } from 'express';
import { PrecController } from '../prec/controllers/PrecController';

/** 판례 — 법제처 공동활용 API 실시간 조회(DB 적재 없음). */
export class PrecHandler {
  public router: Router;
  private controller: PrecController;

  constructor() {
    this.router = Router();
    this.controller = new PrecController();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // 게이트는 index.ts 가 /api 전체에 authGuard 로 한 번 건다.
    this.router.get('/search', this.controller.search.bind(this.controller));
    this.router.get('/detail/:id', this.controller.detail.bind(this.controller));
  }
}
