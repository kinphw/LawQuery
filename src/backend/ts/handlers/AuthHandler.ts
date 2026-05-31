import { Router } from 'express';
import { AuthController } from '../auth/controllers/AuthController';
import { AdminController } from '../auth/controllers/AdminController';
import { adminGuard } from '../auth/middleware/authGuard';

/**
 * 인증 라우터. /api/auth/* 는 게이트 밖(누구나 접근),
 * /api/admin/* 은 adminGuard로 보호.
 */
export class AuthHandler {
  public router: Router;
  private auth: AuthController;
  private admin: AdminController;

  constructor() {
    this.router = Router();
    this.auth = new AuthController();
    this.admin = new AdminController();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // 공개 (게이트 밖)
    this.router.post('/auth/register', this.auth.register);
    this.router.post('/auth/login', this.auth.login);
    this.router.post('/auth/logout', this.auth.logout);
    this.router.get('/auth/me', this.auth.me);
    this.router.post('/auth/app-enter', this.auth.appEnter);

    // 관리자 전용
    this.router.get('/admin/members', adminGuard, this.admin.listMembers);
    this.router.post('/admin/members/:id/approve', adminGuard, this.admin.approve);
    this.router.post('/admin/members/:id/reject', adminGuard, this.admin.reject);
    this.router.post('/admin/members/:id/revoke', adminGuard, this.admin.revoke);
  }
}
