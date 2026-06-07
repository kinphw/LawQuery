import DbContext from '../../common/DbContext';

export type SignupSource = 'web' | 'app';
export type MemberStatus = 'pending' | 'approved' | 'rejected' | 'revoked';
export type MemberRole = 'user' | 'admin';
export type MemberPlan = 'free' | 'pro';

/**
 * 만료를 반영한 실효 등급. 만료된 pro는 free로 취급.
 * (베타엔 plan_expires_at=NULL이라 항상 원래 plan 그대로 → 동작 변화 없음)
 */
export function effectivePlan(m: Pick<Member, 'plan' | 'plan_expired'>): MemberPlan {
  // plan_expired는 드라이버에 따라 1/0 또는 '1'/'0'일 수 있어 숫자로 안전 비교.
  return Number(m.plan_expired) === 1 ? 'free' : m.plan;
}

export interface Member {
  id: number;
  login_id: string;
  password_hash: string | null;
  display_name: string | null;
  occupation: string | null;
  signup_source: SignupSource;
  status: MemberStatus;
  role: MemberRole;
  plan: MemberPlan;
  plan_expires_at: string | null; // PRO 만료 시각(KST). NULL = 무기한(베타). 정식 출시 시 30일 트라이얼에 사용.
  plan_expired?: number;          // findById 계산 컬럼: 만료됐으면 1 (NOW() 기준, DB 시각으로 비교 → TZ 안전)
  verify_code_hash?: string | null;   // 이메일 인증번호 해시
  verify_expires_at?: string | null;  // 인증번호 만료 시각
  verify_attempts?: number;           // 인증 시도 횟수(잠금용)
  verify_sent_at?: string | null;     // 마지막 발송 시각(재전송 쿨다운용)
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
    // plan_expired는 DB 시각(NOW())으로 비교해 TZ 문제 회피. 게이트/me가 실효 등급 계산에 사용.
    const rows = await this.db.query<Member>(
      'SELECT *, (plan_expires_at IS NOT NULL AND plan_expires_at <= NOW()) AS plan_expired FROM member WHERE id = ? LIMIT 1',
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

  /** 웹 가입. 무료 베타라 plan 기본 pro(가입 즉시 킬 기능 개방, 만료 없음). */
  async createWebMember(
    loginId: string,
    passwordHash: string,
    displayName: string | null,
    role: MemberRole = 'user',
    status: MemberStatus = 'approved',
    plan: MemberPlan = 'pro',
    occupation: string | null = null,
    planExpiresAt: string | null = null // 베타=NULL(무기한). 정식 출시 때 now()+30일로 넘기면 트라이얼.
  ): Promise<number> {
    const result: any = await this.db.query(
      `INSERT INTO member (login_id, password_hash, display_name, occupation, signup_source, status, role, plan, plan_expires_at)
       VALUES (?, ?, ?, ?, 'web', ?, ?, ?, ?)`,
      [loginId, passwordHash, displayName, occupation, status, role, plan, planExpiresAt]
    );
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

  /** 등급(plan) 변경 — 관리자 수동 부여(free↔pro). 관리자 부여는 만료 없이 영구(만료시각 초기화). */
  async updatePlan(id: number, plan: MemberPlan): Promise<void> {
    await this.db.query('UPDATE member SET plan = ?, plan_expires_at = NULL WHERE id = ?', [plan, id]);
  }

  // ── 이메일 인증 ───────────────────────────────────────────────

  /** 인증번호(해시) 설정 + 만료(분)·발송시각 갱신, 시도횟수 초기화. 시각은 DB NOW() 기준(TZ 안전). */
  async setVerification(id: number, codeHash: string, ttlMinutes = 10): Promise<void> {
    await this.db.query(
      `UPDATE member
       SET verify_code_hash = ?, verify_expires_at = NOW() + INTERVAL ? MINUTE,
           verify_attempts = 0, verify_sent_at = NOW()
       WHERE id = ?`,
      [codeHash, ttlMinutes, id]
    );
  }

  /** 인증 상태(해시·유효여부·시도횟수·재전송 차단여부)를 DB 시각 기준으로 조회. */
  async getVerification(id: number): Promise<{
    codeHash: string | null; valid: number; attempts: number; resendBlocked: number;
  } | null> {
    const rows = await this.db.query<any>(
      `SELECT verify_code_hash AS codeHash,
              (verify_expires_at IS NOT NULL AND verify_expires_at > NOW()) AS valid,
              verify_attempts AS attempts,
              (verify_sent_at IS NOT NULL AND verify_sent_at > NOW() - INTERVAL 60 SECOND) AS resendBlocked
       FROM member WHERE id = ? LIMIT 1`,
      [id]
    );
    return rows[0] ?? null;
  }

  /** 인증 시도 1회 증가. */
  async bumpVerifyAttempt(id: number): Promise<void> {
    await this.db.query('UPDATE member SET verify_attempts = verify_attempts + 1 WHERE id = ?', [id]);
  }

  /** 인증 성공 → 승인 처리 + 인증 데이터 정리. */
  async markVerified(id: number): Promise<void> {
    await this.db.query(
      `UPDATE member
       SET status = 'approved', approved_at = NOW(),
           verify_code_hash = NULL, verify_expires_at = NULL, verify_attempts = 0, verify_sent_at = NULL
       WHERE id = ?`,
      [id]
    );
  }

  /** 미인증(pending) 이메일 재가입 시 비번/이름/직군만 갱신(상태는 pending 유지). */
  async refreshPendingSignup(id: number, passwordHash: string, displayName: string | null, occupation: string | null): Promise<void> {
    await this.db.query(
      'UPDATE member SET password_hash = ?, display_name = ?, occupation = ? WHERE id = ?',
      [passwordHash, displayName, occupation, id]
    );
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
