import { Router, Request, Response } from 'express';
import { InterpretationController } from '../interpretation/controllers/InterpretationController';
import { InterpretationOriginalController } from '../interpretation/controllers/InterpretationOriginalController';

export class InterpretationHandler {
  public router: Router;
  private controller: InterpretationController;
  private originals: InterpretationOriginalController;

  constructor() {
    this.router = Router();
    this.controller = new InterpretationController();
    this.originals = new InterpretationOriginalController();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // 게이트는 index.ts 가 /api 전체에 authGuard 로 한 번 건다.
    this.router.get('/initial', this.controller.getInitialData.bind(this.controller));
    this.router.get('/search', this.controller.search.bind(this.controller));
    this.router.get('/detail/:id', this.controller.getDetail.bind(this.controller));
    // 원문(포털 회신 첨부) — 로컬(오프라인)판엔 없는 길이라 컨트롤러를 따로 둔다.
    this.router.get('/files/:id', this.originals.files.bind(this.originals));
    this.router.get('/original/:id/:sha', this.originals.original.bind(this.originals));
  }
}