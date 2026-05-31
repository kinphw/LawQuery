import DbContext from '../../common/DbContext';

export type AccessEvent = 'login' | 'app_enter';

export interface AccessLog {
  id: number;
  member_id: number;
  email: string | null;
  event: AccessEvent;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
}

/** 접속(로그인/앱진입) 기록. 회원의 실제 이용 여부 파악용. */
export class AccessLogModel {
  private db;

  constructor() {
    this.db = DbContext.getInstance(process.env.AUTH_DB || 'ldb_auth');
  }

  async record(
    memberId: number,
    email: string | null,
    event: AccessEvent,
    ip: string | null,
    userAgent: string | null
  ): Promise<void> {
    // user_agent는 길 수 있으니 안전하게 자름
    const ua = userAgent ? userAgent.slice(0, 500) : null;
    await this.db.query(
      `INSERT INTO access_log (member_id, email, event, ip, user_agent)
       VALUES (?, ?, ?, ?, ?)`,
      [memberId, email, event, ip, ua]
    );
  }

  /** 최근 접속 기록 (기본 200건). */
  async list(limit = 200): Promise<AccessLog[]> {
    const n = Math.min(Math.max(1, limit), 1000);
    return this.db.query<AccessLog>(
      `SELECT * FROM access_log ORDER BY created_at DESC, id DESC LIMIT ${n}`
    );
  }
}
