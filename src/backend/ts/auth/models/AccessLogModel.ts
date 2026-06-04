import DbContext from '../../common/DbContext';

// 통합 활동 로그 이벤트
//  login       : 로그인 성공
//  login_fail  : 로그인 실패(비번 틀림/미승인 등)
//  app_enter   : 앱 자동진입
//  page_visit  : 페이지 접근(비로그인 포함)
export type AccessEvent = 'login' | 'login_fail' | 'app_enter' | 'page_visit';

export interface AccessLog {
  id: number;
  member_id: number | null;
  email: string | null;
  display_name: string | null; // member 조인 결과(이름 일관 표시용)
  event: AccessEvent;
  path: string | null;
  ip: string | null;
  user_agent: string | null;
  visit_date: string | null;
  created_at: string;
}

export interface DailySummary {
  visit_date: string;
  total: number;
  unique_ips: number;
}

/**
 * 통합 활동 로그. 로그인(성공/실패)·앱진입·페이지접근을 한 테이블로 관리.
 * 회원 이름은 member 테이블 조인으로 일관 표시.
 */
export class AccessLogModel {
  private db;

  constructor() {
    this.db = DbContext.getInstance(process.env.AUTH_DB || 'ldb_auth');
  }

  async record(
    memberId: number | null,
    email: string | null,
    event: AccessEvent,
    ip: string | null,
    userAgent: string | null,
    path: string | null = null
  ): Promise<void> {
    const ua = userAgent ? userAgent.slice(0, 500) : null;
    const p = path ? path.slice(0, 250) : null;
    await this.db.query(
      `INSERT INTO access_log (member_id, email, event, path, ip, user_agent, visit_date)
       VALUES (?, ?, ?, ?, ?, ?, CURDATE())`,
      [memberId, email, event, p, ip, ua]
    );
  }

  /**
   * 활동 로그 목록. event로 필터 가능(없으면 전체).
   * member.display_name을 조인해 이름을 함께 반환.
   */
  async list(event?: AccessEvent, limit = 300): Promise<AccessLog[]> {
    const n = Math.min(Math.max(1, limit), 2000);
    const where = event ? 'WHERE a.event = ?' : '';
    const params = event ? [event] : [];
    return this.db.query<AccessLog>(
      `SELECT a.*, m.display_name
       FROM access_log a
       LEFT JOIN member m ON m.id = a.member_id
       ${where}
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT ${n}`,
      params
    );
  }

  /** 일자별 페이지 접근 집계(page_visit 이벤트 기준). */
  async dailySummary(days = 60): Promise<DailySummary[]> {
    const n = Math.min(Math.max(1, days), 365);
    return this.db.query<DailySummary>(
      `SELECT visit_date,
              COUNT(*)           AS total,
              COUNT(DISTINCT ip) AS unique_ips
       FROM access_log
       WHERE event = 'page_visit' AND visit_date IS NOT NULL
       GROUP BY visit_date
       ORDER BY visit_date DESC
       LIMIT ${n}`
    );
  }

  /** 특정 일자의 페이지 접근 상세. */
  async listByDate(date: string, limit = 1000): Promise<AccessLog[]> {
    const n = Math.min(Math.max(1, limit), 5000);
    return this.db.query<AccessLog>(
      `SELECT a.*, m.display_name
       FROM access_log a
       LEFT JOIN member m ON m.id = a.member_id
       WHERE a.event = 'page_visit' AND a.visit_date = ?
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT ${n}`,
      [date]
    );
  }
}
