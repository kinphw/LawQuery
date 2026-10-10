import DbContext from '../../common/DbContext';

export type SignupSource = 'web' | 'app';
export type MemberStatus = 'pending' | 'approved' | 'rejected' | 'revoked';
export type MemberRole = 'user' | 'admin';
/** 회원 테이블(ldb_auth.member)을 함께 쓰는 서비스. lq = LawQuery, aq = AcctQuery. */
export type MemberService = 'lq' | 'aq';

export interface Member {
  id: number;
  login_id: string;
  password_hash: string | null;
  display_name: string | null;
  occupation: string | null;
  signup_source: SignupSource;
  status: MemberStatus;
  role: MemberRole;
  lq_access: number;                  // LawQuery 이용 허용(1/0). 관리자는 값과 무관하게 통과
  aq_access: number;                  // AcctQuery 이용 허용(1/0). 판정은 AQ 쪽이 한다
  device_key: string | null;
  session_token: string | null;
  created_at: string;
  approved_at: string | null;
  approved_by: number | null;
  last_login_at: string | null;
}

/**
 * LawQuery 이용 권한. 승인(status)과는 별개의 축이다 — 회원 행을 AcctQuery 와 함께 쓰므로
 * 승인된 회원이라도 서비스별 허용(lq_access)이 켜져 있어야 한다. 관리자는 항상 통과.
 */
export function hasLqAccess(m: Pick<Member, 'role' | 'lq_access'>): boolean {
  return m.role === 'admin' || Number(m.lq_access) === 1;
}

/**
 * 회원 데이터 접근 계층. 인증 전용 DB(ldb_auth)만 사용한다.
 * 법령 데이터(ldb_i/j/s/y)와 완전히 분리.
 */
export class MemberModel {
  private db;

  constructor() {
    this.db = DbContext.getInstance(process.env.AUTH_DB || 'ldb_auth');
  }

  /** 전체 회원 수 (최초 가입자 관리자 판별용). */
  async countMembers(): Promise<number> {
    const rows = await this.db.query<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM member');
    return Number(rows[0]?.cnt ?? 0);
  }

  /** 승인 대기 회원 수 (대기 알림 뱃지용). */
  async countPending(): Promise<number> {
    const rows = await this.db.query<{ cnt: number }>(
      "SELECT COUNT(*) AS cnt FROM member WHERE status = 'pending'"
    );
    return Number(rows[0]?.cnt ?? 0);
  }

  /** 일별 가입 추이. */
  async dailySignups(days = 30): Promise<Array<{ d: string; cnt: number }>> {
    const n = Math.min(Math.max(1, days), 180);
    return this.db.query(
      `SELECT DATE(created_at) AS d, COUNT(*) AS cnt
       FROM member
       WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ${n} DAY)
       GROUP BY DATE(created_at) ORDER BY d DESC`
    );
  }

  async findByLoginId(loginId: string): Promise<Member | null> {
    const rows = await this.db.query<Member>(
      'SELECT * FROM member WHERE login_id = ? LIMIT 1',
      [loginId]
    );
    return rows[0] ?? null;
  }

  async findById(id: number): Promise<Member | null> {
    const rows = await this.db.query<Member>(
      'SELECT * FROM member WHERE id = ? LIMIT 1',
      [id]
    );
    return rows[0] ?? null;
  }

  /**
   * 웹 가입 신청. LawQuery 에서 신청한 행이므로 lq_access=1 로 만든다(어느 서비스로 신청했는지의 표시).
   * aq_access 는 최초 관리자만 1 — 일반 신청자는 0 이고 관리자가 화면에서 켠다.
   */
  async createWebMember(
    loginId: string,
    passwordHash: string,
    displayName: string | null,
    role: MemberRole = 'user',
    status: MemberStatus = 'pending'
  ): Promise<number> {
    const result: any = await this.db.query(
      `INSERT INTO member (login_id, password_hash, display_name, signup_source, status, role, lq_access, aq_access)
       VALUES (?, ?, ?, 'web', ?, ?, 1, ?)`,
      [loginId, passwordHash, displayName, status, role, role === 'admin' ? 1 : 0]
    );
    return (result as any).insertId ?? (result as any)[0]?.insertId;
  }

  async updateStatus(id: number, status: MemberStatus, approvedBy: number | null): Promise<void> {
    await this.db.query(
      `UPDATE member
       SET status = ?, approved_at = IF(? = 'approved', NOW(), approved_at), approved_by = ?
       WHERE id = ?`,
      [status, status, approvedBy, id]
    );
  }

  async touchLogin(id: number): Promise<void> {
    await this.db.query('UPDATE member SET last_login_at = NOW() WHERE id = ?', [id]);
  }

  /** 로그인 시 세션 토큰 갱신 → 이전 기기의 세션 무효화(중복 로그인 차단). */
  async setSessionToken(id: number, sessionToken: string): Promise<void> {
    await this.db.query('UPDATE member SET session_token = ? WHERE id = ?', [sessionToken, id]);
  }

  /** 본인 표시 이름 변경 */
  async updateDisplayName(id: number, displayName: string): Promise<void> {
    await this.db.query('UPDATE member SET display_name = ? WHERE id = ?', [displayName, id]);
  }

  /** 비밀번호 해시 변경 */
  async updatePassword(id: number, passwordHash: string): Promise<void> {
    await this.db.query('UPDATE member SET password_hash = ? WHERE id = ?', [passwordHash, id]);
  }

  /** 서비스별 이용 허용 변경(관리자). 컬럼명은 화이트리스트로만 고른다. */
  async setAccess(id: number, service: MemberService, enabled: boolean): Promise<void> {
    const col = service === 'aq' ? 'aq_access' : 'lq_access';
    await this.db.query(`UPDATE member SET ${col} = ? WHERE id = ?`, [enabled ? 1 : 0, id]);
  }

  /** 회원 삭제. 활동 로그는 보존(member_id만 남고 조인 시 이름이 비게 됨). */
  async deleteMember(id: number): Promise<void> {
    await this.db.query('DELETE FROM member WHERE id = ?', [id]);
  }

  /**
   * 회원 목록. last_seen_at = LawQuery 를 마지막으로 연 때.
   * member.last_login_at 은 AcctQuery(AQ) 로그인도 갱신하므로(회원 행을 함께 쓴다) 관리 화면의 '최근 접속'으로 쓰면
   * AQ 접속이 LawQuery 접속처럼 보인다 → access_log 에서 AQ 기록(path '/aq…')을 뺀 최근 시각을 따로 구한다.
   */
  async listByStatus(status?: MemberStatus): Promise<Array<Member & { last_seen_at: string | null; last_seen_aq_at: string | null }>> {
    const seen = `(SELECT MAX(l.created_at) FROM access_log l
                   WHERE l.member_id = m.id AND (l.path IS NULL OR l.path NOT LIKE '/aq%')) AS last_seen_at,
                  (SELECT MAX(l.created_at) FROM access_log l
                   WHERE l.member_id = m.id AND l.path LIKE '/aq%') AS last_seen_aq_at`;
    if (status) {
      return this.db.query(
        `SELECT m.*, ${seen} FROM member m WHERE m.status = ? ORDER BY m.created_at DESC`,
        [status]
      );
    }
    return this.db.query(`SELECT m.*, ${seen} FROM member m ORDER BY m.created_at DESC`);
  }
}
