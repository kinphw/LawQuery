import { Router } from 'express';
import { LawController } from '../law/controllers/LawController';
import { PenaltyController } from '../law/controllers/PenaltyController';
import { ReferenceController } from '../law/controllers/ReferenceController';
// import { LawMiddleware } from '../law/middleware/LawMiddleware';

export class LawHandler {
  public router: Router;
  private controller: LawController;
  private penaltyController: PenaltyController;
  private referenceController: ReferenceController;


  constructor() {
    this.router = Router();
    this.controller = new LawController();
    this.penaltyController = new PenaltyController();
    this.referenceController = new ReferenceController(); 
    this.initializeRoutes();
  }

  private initializeRoutes(): void {

    // 법률 관련 미들웨어 적용 :
    // this.router.use(LawMiddleware); 

    this.router.get('/all', this.controller.getAll.bind(this.controller));
    this.router.get('/get', this.controller.getByIds.bind(this.controller)); // 파라미터 처리를 컨트롤러로 위임
    this.router.get('/getTitles', this.controller.getTitles.bind(this.controller));
    this.router.get('/penalty', this.penaltyController.getPenalty.bind(this.penaltyController)); // 250504
    this.router.get('/penaltyIds', this.penaltyController.getPenaltyIds.bind(this.penaltyController)); // 250505
    this.router.get('/reference', this.referenceController.getReference.bind(this.referenceController)); // 참조규정
    this.router.get('/referenceIds', this.referenceController.getReferenceIds.bind(this.referenceController)); 
  }
}