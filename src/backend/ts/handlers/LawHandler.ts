import { Router } from 'express';
import { LawController } from '../law/controllers/LawController';
import { PenaltyController } from '../law/controllers/PenaltyController';
import { ReferenceController } from '../law/controllers/ReferenceController';
import { AnnexController } from '../law/controllers/AnnexController';

export class LawHandler {
  public router: Router;
  private controller: LawController;
  private penaltyController: PenaltyController;
  private referenceController: ReferenceController;
  private annexController: AnnexController;


  constructor() {
    this.router = Router();
    this.controller = new LawController();
    this.penaltyController = new PenaltyController();
    this.referenceController = new ReferenceController();
    this.annexController = new AnnexController();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {

    // 법률 관련 미들웨어 적용 :
    // this.router.use(LawMiddleware); 

    // 게이트는 index.ts 가 /api 전체에 authGuard 로 한 번 건다(여기선 붙이지 않는다).
    this.router.get('/list', this.controller.getLawList.bind(this.controller)); // 법령 목록(드롭다운/설정 단일 출처)
    this.router.get('/getTitles', this.controller.getTitles.bind(this.controller));
    this.router.get('/article', this.controller.getArticle.bind(this.controller));
    this.router.get('/meta', this.controller.getMeta.bind(this.controller));
    this.router.get('/penaltyIds', this.penaltyController.getPenaltyIds.bind(this.penaltyController));
    this.router.get('/referenceIds', this.referenceController.getReferenceIds.bind(this.referenceController));
    this.router.get('/annexIds', this.annexController.getAnnexIds.bind(this.annexController));
    this.router.get('/all', this.controller.getAll.bind(this.controller));         // 5단 연계표(전체)
    this.router.get('/get', this.controller.getByIds.bind(this.controller));       // 선택 연계표
    this.router.get('/pivot', this.controller.getPivot.bind(this.controller));     // 기준 전환 피벗 연계표
    this.router.get('/penalty', this.penaltyController.getPenalty.bind(this.penaltyController));
    this.router.get('/delegation', this.controller.getDelegationChain.bind(this.controller)); // 벌칙 위반조 위임 하위(시행령 등)
    this.router.get('/highlights', this.controller.getHighlights.bind(this.controller)); // 5단표 강조쌍(전체)
    this.router.get('/reference', this.referenceController.getReference.bind(this.referenceController));
    this.router.get('/annex', this.annexController.getAnnex.bind(this.annexController));
  }
}