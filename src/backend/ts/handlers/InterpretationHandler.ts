import { Router, Request, Response } from 'express';
import { InterpretationController } from '../interpretation/controllers/InterpretationController';
import { optionalAuth, proGuard } from '../auth/middleware/authGuard';

export class InterpretationHandler {
  public router: Router;
  private controller: InterpretationController;

  constructor() {
    this.router = Router();
    this.controller = new InterpretationController();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // 비회원 티저(optionalAuth, 컨트롤러가 절단+본문 인라인):
    //   - 초기목록 상위 10건, 검색결과 상위 3건 + 그 행들의 본문(질의요지/회답/이유)만 함께 내려줌.
    //   - 상세(/detail)는 PRO 전용 유지 → 임의 id로 전체를 긁지 못하게 막는다(보이는 행 본문은 위에서 이미 전달).
    this.router.get('/initial', optionalAuth, this.controller.getInitialData.bind(this.controller));
    this.router.get('/search', optionalAuth, this.controller.search.bind(this.controller));
    this.router.get('/detail/:id', proGuard, this.controller.getDetail.bind(this.controller));
  }
}