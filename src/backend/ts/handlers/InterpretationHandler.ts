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
    this.router.get('/search', this.controller.search.bind(this.controller));
    this.router.get('/initial', this.controller.getInitialData.bind(this.controller));
    this.router.get('/detail/:id', this.controller.getDetail.bind(this.controller));
  }
}