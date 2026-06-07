import { Router, Request, Response } from 'express';
import { InterpretationController } from '../interpretation/controllers/InterpretationController';
import { proGuard } from '../auth/middleware/authGuard';

export class InterpretationHandler {
  public router: Router;
  private controller: InterpretationController;

  constructor() {
    this.router = Router();
    this.controller = new InterpretationController();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // 유권해석·비조치의견서는 통째로 PRO (외부에선 검색·조회 자체가 거의 불가능한 게 가치)
    this.router.get('/search', proGuard, this.controller.search.bind(this.controller));
    this.router.get('/initial', proGuard, this.controller.getInitialData.bind(this.controller));
    this.router.get('/detail/:id', proGuard, this.controller.getDetail.bind(this.controller));
  }
}