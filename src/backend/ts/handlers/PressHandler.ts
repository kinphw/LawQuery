import { Router } from 'express';
import { PressController } from '../press/controllers/PressController';

/** 기관 보도자료(금융위·금감원·기재부·한은) 통합검색 + 원문 보기. */
export class PressHandler {
  public router: Router;
  private controller: PressController;

  constructor() {
    this.router = Router();
    this.controller = new PressController();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // 게이트는 index.ts 가 /api 전체에 authGuard 로 한 번 건다.
    this.router.get('/sources', this.controller.sources.bind(this.controller));
    this.router.get('/search', this.controller.search.bind(this.controller));
    this.router.get('/count', this.controller.count.bind(this.controller));
    this.router.get('/doc/:id', this.controller.doc.bind(this.controller));
    this.router.get('/original/:id', this.controller.original.bind(this.controller));
  }
}
