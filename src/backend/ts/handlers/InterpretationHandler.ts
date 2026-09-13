import { Router, Request, Response } from 'express';
import { InterpretationController } from '../interpretation/controllers/InterpretationController';

export class InterpretationHandler {
  public router: Router;
  private controller: InterpretationController;

  constructor() {
    this.router = Router();
    this.controller = new InterpretationController();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // 게이트는 index.ts 가 /api 전체에 authGuard 로 한 번 건다.
    this.router.get('/initial', this.controller.getInitialData.bind(this.controller));
    this.router.get('/search', this.controller.search.bind(this.controller));
    this.router.get('/detail/:id', this.controller.getDetail.bind(this.controller));
  }
}