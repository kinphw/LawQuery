import DbContext from '../common/DbContext';

export interface BoardPost {
  id: number;
  member_id: number;
  title: string;
  content: string;
  created_at: string;
  updated_at: string | null;
  author: string | null;       // 조인: display_name || login_id
  comment_count?: number;
}

export interface BoardComment {
  id: number;
  post_id: number;
  member_id: number;
  content: string;
  created_at: string;
  author: string | null;
}

/** 건의사항 게시판(글/댓글). 인증 DB(ldb_auth)에 저장. */
export class BoardModel {
  private db;
  constructor() {
    this.db = DbContext.getInstance(process.env.AUTH_DB || 'ldb_auth');
  }

  // 작성자 표시: 이름 우선, 없으면 로그인ID
  private static AUTHOR = "COALESCE(NULLIF(m.display_name,''), m.login_id)";

  async listPosts(limit = 100): Promise<BoardPost[]> {
    const n = Math.min(Math.max(1, limit), 500);
    return this.db.query<BoardPost>(
      `SELECT p.id, p.member_id, p.title, p.created_at, p.updated_at,
              ${BoardModel.AUTHOR} AS author,
              (SELECT COUNT(*) FROM board_comment c WHERE c.post_id = p.id) AS comment_count
       FROM board_post p
       LEFT JOIN member m ON m.id = p.member_id
       ORDER BY p.id DESC
       LIMIT ${n}`
    );
  }

  async getPost(id: number): Promise<BoardPost | null> {
    const rows = await this.db.query<BoardPost>(
      `SELECT p.*, ${BoardModel.AUTHOR} AS author
       FROM board_post p LEFT JOIN member m ON m.id = p.member_id
       WHERE p.id = ? LIMIT 1`,
      [id]
    );
    return rows[0] ?? null;
  }

  async createPost(memberId: number, title: string, content: string): Promise<number> {
    const r: any = await this.db.query(
      'INSERT INTO board_post (member_id, title, content) VALUES (?, ?, ?)',
      [memberId, title, content]
    );
    return r.insertId ?? r[0]?.insertId;
  }

  async updatePost(id: number, title: string, content: string): Promise<void> {
    await this.db.query(
      'UPDATE board_post SET title = ?, content = ?, updated_at = NOW() WHERE id = ?',
      [title, content, id]
    );
  }

  async deletePost(id: number): Promise<void> {
    await this.db.query('DELETE FROM board_comment WHERE post_id = ?', [id]);
    await this.db.query('DELETE FROM board_post WHERE id = ?', [id]);
  }

  async listComments(postId: number): Promise<BoardComment[]> {
    return this.db.query<BoardComment>(
      `SELECT c.id, c.post_id, c.member_id, c.content, c.created_at,
              ${BoardModel.AUTHOR} AS author
       FROM board_comment c LEFT JOIN member m ON m.id = c.member_id
       WHERE c.post_id = ? ORDER BY c.id ASC`,
      [postId]
    );
  }

  async createComment(postId: number, memberId: number, content: string): Promise<number> {
    const r: any = await this.db.query(
      'INSERT INTO board_comment (post_id, member_id, content) VALUES (?, ?, ?)',
      [postId, memberId, content]
    );
    return r.insertId ?? r[0]?.insertId;
  }

  async getComment(id: number): Promise<BoardComment | null> {
    const rows = await this.db.query<BoardComment>('SELECT * FROM board_comment WHERE id = ? LIMIT 1', [id]);
    return rows[0] ?? null;
  }

  async deleteComment(id: number): Promise<void> {
    await this.db.query('DELETE FROM board_comment WHERE id = ?', [id]);
  }
}
