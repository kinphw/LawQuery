import { Router } from 'express';
import { BoardController } from '../board/BoardController';
import { authGuard } from '../auth/middleware/authGuard';

/** 건의사항 게시판 라우터. 전부 authGuard(로그인+승인) 보호. */
export class BoardHandler {
  public router: Router;
  private ctrl: BoardController;

  constructor() {
    this.router = Router();
    this.ctrl = new BoardController();
    this.router.use(authGuard); // 게시판은 로그인 사용자만
    this.init();
  }

  private init(): void {
    this.router.get('/posts', this.ctrl.listPosts);
    this.router.post('/posts', this.ctrl.createPost);
    this.router.get('/posts/:id', this.ctrl.getPost);
    this.router.put('/posts/:id', this.ctrl.updatePost);
    this.router.delete('/posts/:id', this.ctrl.deletePost);
    this.router.post('/posts/:id/comments', this.ctrl.createComment);
    this.router.delete('/comments/:cid', this.ctrl.deleteComment);
  }
}
