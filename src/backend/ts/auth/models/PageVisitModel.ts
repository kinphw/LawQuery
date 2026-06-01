import DbContext from '../../common/DbContext';

export interface PageVisit {
  id: number;
  path: string | null;
  ip: string | null;
  member_id: number | null;
  user_agent: string | null;
  visit_date: string;
  created_at: string;
}

export interface DailyVisitSummary {
  visit_date: string;
  total: number;       // 그날 총 접근 수
  unique_ips: number;  // 그날 고유 IP 수
}

/**
 * 페이지 접근 기록 (비로그인 포함). access_log(로그인 기록)와 분리.
 * 페이지 진입마다 1행 → 양이 많으므로 별도 테이블로 관리.
 */
export class PageVisitModel {
  private db;

  constructor() {
    this.db = DbContext.getInstance(process.env.AUTH_DB || 'ldb_auth');
  }

  async record(
    path: string | null,
    ip: string | null,
    memberId: number | null,
    userAgent: string | null
  ): Promise<void> {
    const p = path ? path.slice(0, 250) : null;
    const ua = userAgent ? userAgent.slice(0, 500) : null;
    // visit_date는 KST 기준 날짜(서버 timezone +09:00이 풀에 설정됨)
    await this.db.query(
      `INSERT INTO page_visit (path, ip, member_id, user_agent, visit_date)
       VALUES (?, ?, ?, ?, CURDATE())`,
      [p, ip, memberId, ua]
    );
  }

  /** 일자별 집계 (최근 N일). */
  async dailySummary(days = 60): Promise<DailyVisitSummary[]> {
    const n = Math.min(Math.max(1, days), 365);
    return this.db.query<DailyVisitSummary>(
      `SELECT visit_date,
              COUNT(*)          AS total,
              COUNT(DISTINCT ip) AS unique_ips
       FROM page_visit
       GROUP BY visit_date
       ORDER BY visit_date DESC
       LIMIT ${n}`
    );
  }

  /** 특정 일자의 상세 접근 목록. */
  async listByDate(date: string, limit = 500): Promise<PageVisit[]> {
    const n = Math.min(Math.max(1, limit), 2000);
    return this.db.query<PageVisit>(
      `SELECT * FROM page_visit
       WHERE visit_date = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ${n}`,
      [date]
    );
  }
}
