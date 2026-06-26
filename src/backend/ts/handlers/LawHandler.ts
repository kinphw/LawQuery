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
    this.router.get('/list', optionalAuth, this.controller.getLawList.bind(this.controller)); // 법령 목록(드롭다운/설정 단일 출처)
    this.router.get('/getTitles', optionalAuth, this.controller.getTitles.bind(this.controller));
    this.router.get('/article', optionalAuth, this.controller.getArticle.bind(this.controller));
    this.router.get('/meta', optionalAuth, this.controller.getMeta.bind(this.controller));
    // 버튼 표시 플래그(어디에 PRO 기능이 있는지)는 무료도 받아 잠금 버튼 노출
    this.router.get('/penaltyIds', optionalAuth, this.penaltyController.getPenaltyIds.bind(this.penaltyController));
    this.router.get('/referenceIds', optionalAuth, this.referenceController.getReferenceIds.bind(this.referenceController));
    this.router.get('/annexIds', optionalAuth, this.annexController.getAnnexIds.bind(this.annexController));

    // ── 연계표(킬) — 비회원에게도 '상위 3개 조'만 티저로 공개(optionalAuth). 전체는 컨트롤러가 pro만 내려줌 ──
    this.router.get('/all', optionalAuth, this.controller.getAll.bind(this.controller));      // 5단 연계표(비회원=상위 3개 조 티저)
    // ── PRO 전용(proGuard) — 킬 기능 ──
    this.router.get('/get', proGuard, this.controller.getByIds.bind(this.controller));       // 선택 연계표(킬)
    this.router.get('/pivot', proGuard, this.controller.getPivot.bind(this.controller));     // 기준 전환 피벗 연계표(킬)
    this.router.get('/penalty', proGuard, this.penaltyController.getPenalty.bind(this.penaltyController));
    this.router.get('/delegation', proGuard, this.controller.getDelegationChain.bind(this.controller)); // 벌칙 위반조 위임 하위(시행령 등)
    this.router.get('/reference', proGuard, this.referenceController.getReference.bind(this.referenceController));
    this.router.get('/annex', proGuard, this.annexController.getAnnex.bind(this.annexController));
  }
}