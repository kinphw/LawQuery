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
  login_id: string | null;
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
    loginId: string | null,
    event: AccessEvent,
    ip: string | null,
    userAgent: string | null,
    path: string | null = null
  ): Promise<void> {
    const ua = userAgent ? userAgent.slice(0, 500) : null;
    const p = path ? path.slice(0, 250) : null;
    await this.db.query(
      `INSERT INTO access_log (member_id, login_id, event, path, ip, user_agent, visit_date)
       VALUES (?, ?, ?, ?, ?, ?, CURDATE())`,
      [memberId, loginId, event, p, ip, ua]
    );
  }

  /**
   * 활동 로그 목록. event로 필터 가능(없으면 전체).
   * member.display_name을 조인해 이름을 함께 반환.
   */
  async list(event?: AccessEvent, limit = 300, from?: string, to?: string): Promise<AccessLog[]> {
    const n = Math.min(Math.max(1, limit), 2000);
    const conds: string[] = [];
    const params: any[] = [];
    if (event) { conds.push('a.event = ?'); params.push(event); }
    if (from) { conds.push('a.created_at >= ?'); params.push(from + ' 00:00:00'); }
    if (to) { conds.push('a.created_at <= ?'); params.push(to + ' 23:59:59'); }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
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

  /** 일별 통계: 날짜별 이벤트 건수(피벗). 최근 days일. */
  async dailyStats(days = 30): Promise<Array<{
    d: string; login: number; login_fail: number; app_enter: number; page_visit: number; uniq_ip: number;
  }>> {
    const n = Math.min(Math.max(1, days), 180);
    return this.db.query(
      `SELECT DATE(created_at) AS d,
              SUM(event='login')      AS login,
              SUM(event='login_fail') AS login_fail,
              SUM(event='app_enter')  AS app_enter,
              SUM(event='page_visit') AS page_visit,
              COUNT(DISTINCT ip)      AS uniq_ip
       FROM access_log
       WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ${n} DAY)
       GROUP BY DATE(created_at)
       ORDER BY d DESC`
    );
  }

  /**
   * 로그인 실패 반복 경고: 최근 24시간 내 login_fail이 임계 이상인 ID/IP.
   * 무차별 대입(brute force) 탐지용.
   */
  async failWarnings(threshold = 3): Promise<Array<{
    login_id: string | null; ip: string | null; fails: number; last_at: string;
  }>> {
    const t = Math.max(2, threshold);
    return this.db.query(
      `SELECT login_id, ip, COUNT(*) AS fails, MAX(created_at) AS last_at
       FROM access_log
       WHERE event = 'login_fail' AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
       GROUP BY login_id, ip
       HAVING fails >= ${t}
       ORDER BY fails DESC, last_at DESC
       LIMIT 100`
    );
  }

  /**
   * 회원별 IP 접근 요약: 회원별로 어떤 IP에서 얼마나 접속했는지 집계.
   * member_id 기준이라 page_visit(login_id는 NULL이지만 member_id는 채워짐)까지 포함 →
   * 로그인 빈도와 무관하게 실제 사용량/접속 IP가 온전히 잡힌다.
   * (login_id는 access_log가 아닌 member 테이블에서 가져온다.)
   */
  async ipSummaryByMember(limit = 200): Promise<Array<{
    login_id: string | null;
    display_name: string | null;
    ips: string;          // 콤마로 묶인 IP 목록
    ip_count: number;
    total: number;
    last_at: string;
  }>> {
    const n = Math.min(Math.max(1, limit), 1000);
    return this.db.query(
      `SELECT m.login_id,
              m.display_name,
              GROUP_CONCAT(DISTINCT a.ip ORDER BY a.ip SEPARATOR ', ') AS ips,
              COUNT(DISTINCT a.ip) AS ip_count,
              COUNT(*)             AS total,
              MAX(a.created_at)    AS last_at
       FROM access_log a
       JOIN member m ON m.id = a.member_id
       GROUP BY a.member_id, m.login_id, m.display_name
       ORDER BY last_at DESC
       LIMIT ${n}`
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
