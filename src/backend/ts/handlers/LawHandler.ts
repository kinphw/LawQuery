import { Router } from 'express';
import { LawController } from '../law/controllers/LawController';
import { PenaltyController } from '../law/controllers/PenaltyController';
import { ReferenceController } from '../law/controllers/ReferenceController';
import { AnnexController } from '../law/controllers/AnnexController';
import { optionalAuth, proGuard } from '../auth/middleware/authGuard';

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

    // ── 무료(비회원 허용, optionalAuth) ──
    this.router.get('/unit', optionalAuth, this.controller.getUnit.bind(this.controller));   // 단일 단위 전체 조회(미끼)
    this.router.get('/getTitles', optionalAuth, this.controller.getTitles.bind(this.controller));
    this.router.get('/article', optionalAuth, this.controller.getArticle.bind(this.controller));
    this.router.get('/meta', optionalAuth, this.controller.getMeta.bind(this.controller));
    // 버튼 표시 플래그(어디에 PRO 기능이 있는지)는 무료도 받아 잠금 버튼 노출
    this.router.get('/penaltyIds', optionalAuth, this.penaltyController.getPenaltyIds.bind(this.penaltyController));
    this.router.get('/referenceIds', optionalAuth, this.referenceController.getReferenceIds.bind(this.referenceController));
    this.router.get('/annexIds', optionalAuth, this.annexController.getAnnexIds.bind(this.annexController));

    // ── PRO 전용(proGuard) — 킬 기능 ──
    this.router.get('/all', proGuard, this.controller.getAll.bind(this.controller));         // 5단 연계표(킬)
    this.router.get('/get', proGuard, this.controller.getByIds.bind(this.controller));       // 선택 연계표(킬)
    this.router.get('/penalty', proGuard, this.penaltyController.getPenalty.bind(this.penaltyController));
    this.router.get('/reference', proGuard, this.referenceController.getReference.bind(this.referenceController));
    this.router.get('/annex', proGuard, this.annexController.getAnnex.bind(this.annexController));
  }
}