import { Router } from 'express';
import { LawController } from '../law/controllers/LawController';

export class LawHandler {
  public router: Router;
  private controller: LawController;

  constructor() {
    this.router = Router();
    this.controller = new LawController();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.get('/all', this.controller.getAll.bind(this.controller));
    this.router.get('/get', this.controller.getByIds.bind(this.controller)); // 파라미터 처리를 컨트롤러로 위임
    this.router.get('/getTitles', this.controller.getTitles.bind(this.controller));
  }
}