import { Request, Response } from 'express';
import { BoardModel } from './BoardModel';

/** 건의사항 게시판. 모든 라우트는 authGuard(로그인+승인)로 보호. */
export class BoardController {
  private model: BoardModel;
  constructor() { this.model = new BoardModel(); }

  // 본인 또는 관리자만 수정/삭제 허용. 비회원 글(ownerId=null)은 관리자만.
  private canModify(req: Request, ownerId: number | null): boolean {
    if (req.member?.role === 'admin') return true;
    return ownerId != null && req.member?.id === ownerId;
  }

  // 비회원 작성 시 표시 이름(선택, 1~50자). 회원이면 무시(NULL).
  private guestNameOf(req: Request): string | null {
    if (req.member) return null;
    const name = (req.body?.guestName ?? '').toString().trim();
    return name ? name.slice(0, 50) : null;
  }

  // 허니팟: 사람에겐 안 보이는 필드. 봇이 채우면 작성된 척 조용히 무시(스팸 차단).
  private isSpam(req: Request): boolean {
    return !!(req.body?.website ?? '').toString().trim();
  }

  listPosts = async (req: Request, res: Response): Promise<void> => {
    try {
      // 피드에서 내용·수정/삭제 권한 표시에 쓰도록 me/isAdmin도 함께 내려줌
      res.json({
        success: true,
        posts: await this.model.listPosts(),
        me: req.member?.id,
        isAdmin: req.member?.role === 'admin',
      });
    } catch (e) { console.error('listPosts', e); res.status(500).json({ success: false, error: '목록 조회 오류' }); }
  };

  getPost = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id, 10);
      const post = await this.model.getPost(id);
      if (!post) { res.status(404).json({ success: false, error: '글을 찾을 수 없습니다.' }); return; }
      const comments = await this.model.listComments(id);
      res.json({ success: true, post, comments, me: req.member?.id, isAdmin: req.member?.role === 'admin' });
    } catch (e) { console.error('getPost', e); res.status(500).json({ success: false, error: '조회 오류' }); }
  };

  createPost = async (req: Request, res: Response): Promise<void> => {
    try {
      const title = (req.body?.title ?? '').toString().trim();
      const content = (req.body?.content ?? '').toString().trim();
      if (!title || title.length > 200) { res.status(400).json({ success: false, error: '제목을 1~200자로 입력해 주세요.' }); return; }
      if (!content || content.length > 10000) { res.status(400).json({ success: false, error: '내용을 입력해 주세요(최대 10000자).' }); return; }
      if (this.isSpam(req)) { res.json({ success: true, id: 0 }); return; } // 봇: 성공한 척 무시
      const id = await this.model.createPost(req.member?.id ?? null, this.guestNameOf(req), title, content);
      res.json({ success: true, id });
    } catch (e) { console.error('createPost', e); res.status(500).json({ success: false, error: '작성 오류' }); }
  };

  updatePost = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id, 10);
      const post = await this.model.getPost(id);
      if (!post) { res.status(404).json({ success: false, error: '글을 찾을 수 없습니다.' }); return; }
      if (!this.canModify(req, post.member_id)) { res.status(403).json({ success: false, error: '수정 권한이 없습니다.' }); return; }
      const title = (req.body?.title ?? '').toString().trim();
      const content = (req.body?.content ?? '').toString().trim();
      if (!title || !content) { res.status(400).json({ success: false, error: '제목과 내용을 입력해 주세요.' }); return; }
      await this.model.updatePost(id, title, content);
      res.json({ success: true });
    } catch (e) { console.error('updatePost', e); res.status(500).json({ success: false, error: '수정 오류' }); }
  };

  deletePost = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id, 10);
      const post = await this.model.getPost(id);
      if (!post) { res.status(404).json({ success: false, error: '글을 찾을 수 없습니다.' }); return; }
      if (!this.canModify(req, post.member_id)) { res.status(403).json({ success: false, error: '삭제 권한이 없습니다.' }); return; }
      await this.model.deletePost(id);
      res.json({ success: true });
    } catch (e) { console.error('deletePost', e); res.status(500).json({ success: false, error: '삭제 오류' }); }
  };

  createComment = async (req: Request, res: Response): Promise<void> => {
    try {
      const postId = parseInt(req.params.id, 10);
      const post = await this.model.getPost(postId);
      if (!post) { res.status(404).json({ success: false, error: '글을 찾을 수 없습니다.' }); return; }
      const content = (req.body?.content ?? '').toString().trim();
      if (!content || content.length > 2000) { res.status(400).json({ success: false, error: '댓글을 1~2000자로 입력해 주세요.' }); return; }
      if (this.isSpam(req)) { res.json({ success: true, id: 0 }); return; } // 봇: 성공한 척 무시
      const id = await this.model.createComment(postId, req.member?.id ?? null, this.guestNameOf(req), content);
      res.json({ success: true, id });
    } catch (e) { console.error('createComment', e); res.status(500).json({ success: false, error: '댓글 작성 오류' }); }
  };

  deleteComment = async (req: Request, res: Response): Promise<void> => {
    try {
      const cid = parseInt(req.params.cid, 10);
      const c = await this.model.getComment(cid);
      if (!c) { res.status(404).json({ success: false, error: '댓글을 찾을 수 없습니다.' }); return; }
      if (!this.canModify(req, c.member_id)) { res.status(403).json({ success: false, error: '삭제 권한이 없습니다.' }); return; }
      await this.model.deleteComment(cid);
      res.json({ success: true });
    } catch (e) { console.error('deleteComment', e); res.status(500).json({ success: false, error: '댓글 삭제 오류' }); }
  };
}
