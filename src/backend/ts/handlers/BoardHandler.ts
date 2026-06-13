import { Router } from 'express';
import { BoardController } from '../board/BoardController';
import { optionalAuth } from '../auth/middleware/authGuard';

/**
 * 건의사항 게시판 라우터.
 * optionalAuth로 비회원도 통과(로그인이면 req.member 부착). 읽기·작성은 비회원 허용,
 * 수정/삭제는 컨트롤러의 canModify가 비회원/타인을 차단(본인·관리자만).
 */
export class BoardHandler {
  public router: Router;
  private ctrl: BoardController;

  constructor() {
    this.router = Router();
    this.ctrl = new BoardController();
    this.router.use(optionalAuth); // 비회원도 읽기·건의 작성 가능(작성자 NULL)
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
