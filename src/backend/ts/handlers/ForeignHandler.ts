import { Router } from 'express';
import { ForeignController } from '../foreign/controllers/ForeignController';
import { optionalAuth, adminGuard } from '../auth/middleware/authGuard';

/**
 * 해외법령 라우터 (/api/foreign/*). 기존 LawHandler(국내 5단)와 독립.
 *  - 본문(목록·조문): 무료 공개(optionalAuth)
 *  - 메모: 열람=공개(optionalAuth) / 작성·삭제=운영자 큐레이션(adminGuard)
 *  - 관리자 본문 수정: adminGuard(+컨트롤러에서 운영 차단)
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

    // ── 메모(운영자 큐레이션): 열람=공개, 작성·삭제=운영자 ──
    this.router.get('/memo', optionalAuth, this.c.getMemos);
    this.router.put('/memo', adminGuard, this.c.putMemo);
    this.router.delete('/memo', adminGuard, this.c.deleteMemo);

    // ── 관리자 본문 인라인 수정(개발계 전용) ──
    this.router.put('/admin/provision', adminGuard, this.c.updateProvision);
  }
}
