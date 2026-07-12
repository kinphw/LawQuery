import { Router } from 'express';
import { adminGuard, optionalAuth, proGuard } from '../auth/middleware/authGuard';
import { PsdTransitionController } from '../foreign-transition/controllers/PsdTransitionController';

/** PSD2/EMD2 -> PSD3/PSR 이행분석. 기존 /api/foreign과 독립된 PRO 연계뷰 API. */
export class PsdTransitionHandler {
  public router: Router = Router();
  private controller = new PsdTransitionController();

  constructor() {
    this.router.get('/catalog', optionalAuth, this.controller.catalog);
    this.router.get('/view', proGuard, this.controller.view);
    this.router.put('/admin/assessment', adminGuard, this.controller.updateAssessment);
  }
}
