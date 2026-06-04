import DbContext from '../../common/DbContext';

export type SignupSource = 'web' | 'app';
export type MemberStatus = 'pending' | 'approved' | 'rejected' | 'revoked';
export type MemberRole = 'user' | 'admin';

export interface Member {
  id: number;
  login_id: string;
  password_hash: string | null;
  display_name: string | null;
  signup_source: SignupSource;
  status: MemberStatus;
  role: MemberRole;
  device_key: string | null;
  session_token: string | null;
  created_at: string;
  approved_at: string | null;
  approved_by: number | null;
  last_login_at: string | null;
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

  async findByDeviceKey(deviceKey: string): Promise<Member | null> {
    const rows = await this.db.query<Member>(
      'SELECT * FROM member WHERE device_key = ? LIMIT 1',
      [deviceKey]
    );
    return rows[0] ?? null;
  }

  /** 웹 가입: status=pending(관리자 승인 대기) */
  async createWebMember(
    loginId: string,
    passwordHash: string,
    displayName: string | null,
    role: MemberRole = 'user',
    status: MemberStatus = 'pending'
  ): Promise<number> {
    const result: any = await this.db.query(
      `INSERT INTO member (login_id, password_hash, display_name, signup_source, status, role)
       VALUES (?, ?, ?, 'web', ?, ?)`,
      [loginId, passwordHash, displayName, status, role]
    );
    // mysql2: insertId는 ResultSetHeader에 있음
    return (result as any).insertId ?? (result as any)[0]?.insertId;
  }

  /** 앱 자동가입: 익명, status=approved 즉시 */
  async createAppMember(loginId: string, deviceKey: string): Promise<number> {
    const result: any = await this.db.query(
      `INSERT INTO member (login_id, password_hash, display_name, signup_source, status, role, device_key, approved_at)
       VALUES (?, NULL, NULL, 'app', 'approved', 'user', ?, NOW())`,
      [loginId, deviceKey]
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

  /** 회원 삭제. 활동 로그는 보존(member_id만 남고 조인 시 이름이 비게 됨). */
  async deleteMember(id: number): Promise<void> {
    await this.db.query('DELETE FROM member WHERE id = ?', [id]);
  }

  async listByStatus(status?: MemberStatus): Promise<Member[]> {
    if (status) {
      return this.db.query<Member>(
        'SELECT * FROM member WHERE status = ? ORDER BY created_at DESC',
        [status]
      );
    }
    return this.db.query<Member>('SELECT * FROM member ORDER BY created_at DESC');
  }
}
