import { Router } from 'express';
import { BoardController } from '../board/BoardController';

/**
 * 건의사항 게시판 라우터.
 * 로그인 게이트는 index.ts 가 /api 전체에 건다. 수정/삭제는 컨트롤러의 canModify 가
 * 타인을 차단(본인·관리자만).
 */
export class BoardHandler {
  public router: Router;
  private ctrl: BoardController;

  constructor() {
    this.router = Router();
    this.ctrl = new BoardController();
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
