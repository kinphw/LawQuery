import { Router } from 'express';
import { ForeignController } from '../foreign/controllers/ForeignController';
import { optionalAuth, proGuard } from '../auth/middleware/authGuard';

/**
 * 해외법령 라우터 (/api/foreign/*). 기존 LawHandler(국내 5단)와 독립.
 *  - 본문(목록·조문): 무료 공개(optionalAuth)
 *  - 메모: PRO 전용(proGuard)
 */
export class ForeignHandler {
  public router: Router;
  private c = new ForeignController();

  constructor() {
    this.router = Router();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // ── 무료(본문 미끼) ──
    this.router.get('/list', optionalAuth, this.c.getList);
    this.router.get('/provisions', optionalAuth, this.c.getProvisions);

    // ── PRO 전용(개인 메모 = 킬 기능) ──
    this.router.get('/memo', proGuard, this.c.getMemos);
    this.router.put('/memo', proGuard, this.c.putMemo);
    this.router.delete('/memo', proGuard, this.c.deleteMemo);
  }
}
