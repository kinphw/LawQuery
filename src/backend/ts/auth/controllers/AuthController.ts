import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { MemberModel, hasLqAccess } from '../models/MemberModel';
import { AccessLogModel } from '../models/AccessLogModel';
import { SettingModel } from '../models/SettingModel';
import { signToken, verifyToken, newSessionToken, AUTH_COOKIE, cookieOptions, expiryFor } from '../utils/jwt';

// 로그인 ID = 이메일. 간단 형식 검증만 한다(인증메일 단계 없음 — 가입은 관리자가 승인한다).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// 비밀번호 규칙: 영문·숫자 6~30자
const PW_RE = /^[a-zA-Z0-9]{6,30}$/;

/**
 * 실제 접속 IP. app.set('trust proxy', true) 덕분에 req.ip가
 * X-Forwarded-For를 파싱한 공인 IP를 반환(아파치 프록시 뒤). sentinel과 동일 방식.
 * IPv6 매핑(::ffff:1.2.3.4) 접두어는 제거해 보기 좋게.
 */
function clientIp(req: Request): string | null {
  let ip = req.ip || req.socket?.remoteAddress || null;
  if (ip && ip.startsWith('::ffff:')) ip = ip.slice(7);
  return ip;
}

export class AuthController {
  private model: MemberModel;
  private logModel: AccessLogModel;
  private settingModel: SettingModel;

  constructor() {
    this.model = new MemberModel();
    this.logModel = new AccessLogModel();
    this.settingModel = new SettingModel();
  }

  /** 공개 배너 설정 (게이트 밖, 누구나). 모든 페이지가 상단 배너 표시에 사용. */
  publicBanner = async (_req: Request, res: Response): Promise<void> => {
    try {
      res.json(await this.settingModel.getPublicBanner());
    } catch {
      res.json({ enabled: false, text: '', color: 'info' });
    }
  };

  /**
   * 로그인 성공 시 인증 쿠키 발급.
   * 기본은 "로그인 유지"(장기 30일, rmb=1) — UX상 매번 재로그인 부담을 줄임.
   * 사용자는 회원바 토글로 단기(30분) 세션으로 언제든 전환 가능(setRemember).
   * 슬라이딩 갱신(authGuard)이 rmb를 보존하므로 발급 시 기본값만 정하면 된다.
   */
  private issueAuthCookie(
    res: Response,
    uid: number,
    role: 'user' | 'admin',
    sid: string,
    remember = true,
  ): void {
    const { expiresIn, maxAgeMs } = expiryFor(remember);
    const token = signToken({ uid, role, sid, rmb: remember ? 1 : 0 }, expiresIn);
    res.cookie(AUTH_COOKIE, token, cookieOptions(maxAgeMs));
  }

  /**
   * 웹 가입 신청: pending 행만 만든다. 메일·인증번호 없음, 자동 로그인 없음.
   * 관리자가 admin.html 에서 승인해야 로그인된다(AcctQuery 와 같은 방식).
   */
  register = async (req: Request, res: Response): Promise<void> => {
    try {
      const loginId = (req.body?.loginId ?? req.body?.email ?? '').trim().toLowerCase();
      const password = req.body?.password ?? '';
      const displayName = (req.body?.displayName ?? '').trim() || null;

      if (!EMAIL_RE.test(loginId)) {
        res.status(400).json({ success: false, error: '올바른 이메일 주소를 입력해 주세요.' });
        return;
      }
      if (typeof password !== 'string' || !PW_RE.test(password)) {
        res.status(400).json({ success: false, error: '비밀번호는 영문·숫자 6~30자로 입력해 주세요.' });
        return;
      }
      // 이미 있는 이메일은 상태와 무관하게 덮어쓰지 않는다. 이메일 소유 확인 단계가 없으므로,
      // 대기 중인 신청의 비밀번호를 남이 다시 신청해 바꿔치기하지 못하게 한다.
      // (AcctQuery 에서 신청한 대기 회원도 여기 걸린다 — LawQuery 허용은 관리자가 스위치로 켠다.)
      const existing = await this.model.findByLoginId(loginId);
      if (existing) {
        const msg = existing.status === 'pending'
          ? '이미 가입 신청된 이메일입니다. 관리자 승인을 기다려 주세요.'
          : '이미 가입된 이메일입니다.';
        res.status(409).json({ success: false, error: msg, status: existing.status });
        return;
      }
      const hash = await bcrypt.hash(password, 10);

      // 최초 계정(회원 0명)은 부트스트랩 관리자 → 즉시 승인/로그인.
      // (승인해 줄 관리자가 아직 없는 닭-달걀 문제 방지)
      if ((await this.model.countMembers()) === 0) {
        const id = await this.model.createWebMember(loginId, hash, displayName, 'admin', 'approved');
        const sid = newSessionToken();
        await this.model.setSessionToken(id, sid);
        this.issueAuthCookie(res, id, 'admin', sid);
        res.json({ success: true, status: 'approved', role: 'admin' });
        return;
      }

      if (!(await this.settingModel.isSignupEnabled())) {
        res.status(403).json({ success: false, error: '현재 신규 가입이 중단되었습니다.' });
        return;
      }
      await this.model.createWebMember(loginId, hash, displayName, 'user', 'pending');
      // 토큰 발급 안 함 — 관리자 승인 후 직접 로그인한다.
      res.json({
        success: true,
        status: 'pending',
        message: '가입 신청이 접수되었습니다. 관리자 승인 후 이용하실 수 있습니다.',
      });
    } catch (e) {
      console.error('register 오류:', e);
      res.status(500).json({ success: false, error: '가입 처리 중 오류가 발생했습니다.' });
    }
  };

  /** 로그인: 승인 + LawQuery 이용이 허용된 계정만 JWT 발급 */
  login = async (req: Request, res: Response): Promise<void> => {
    try {
      const loginId = (req.body?.loginId ?? req.body?.email ?? '').trim().toLowerCase();
      const password = req.body?.password ?? '';

      const ua = req.headers['user-agent'] as string || null;
      const member = await this.model.findByLoginId(loginId);
      if (!member || !member.password_hash) {
        await this.logModel.record(member?.id ?? null, loginId, 'login_fail', clientIp(req), ua);
        res.status(401).json({ success: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
        return;
      }
      const ok = await bcrypt.compare(password, member.password_hash);
      if (!ok) {
        await this.logModel.record(member.id, member.login_id, 'login_fail', clientIp(req), ua);
        res.status(401).json({ success: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
        return;
      }
      // 비밀번호는 맞지만 아직 승인 전(pending)
      if (member.status === 'pending') {
        res.status(403).json({
          success: false,
          status: 'pending',
          error: '가입 신청이 접수되어 관리자 승인을 기다리고 있습니다.',
        });
        return;
      }
      if (member.status !== 'approved') {
        await this.logModel.record(member.id, member.login_id, 'login_fail', clientIp(req), ua);
        const msg =
          member.status === 'rejected' ? '가입이 거부된 계정입니다.'
          : '이용이 정지된 계정입니다.';
        res.status(403).json({ success: false, error: msg, status: member.status });
        return;
      }
      // 승인은 됐지만 LawQuery 이용이 허용되지 않은 회원(예: AcctQuery 만 허용). 관리자는 항상 통과.
      if (!hasLqAccess(member)) {
        await this.logModel.record(member.id, member.login_id, 'login_fail', clientIp(req), ua);
        res.status(403).json({
          success: false,
          code: 'NO_SERVICE_ACCESS',
          error: '이 서비스(LawQuery) 이용 권한이 없습니다. 관리자에게 문의해 주세요.',
        });
        return;
      }

      await this.model.touchLogin(member.id);
      await this.logModel.record(member.id, member.login_id, 'login', clientIp(req), req.headers['user-agent'] as string || null);
      // 중복 로그인 차단: 새 세션 토큰 발급 → 기존 기기 세션 무효화
      const sid = newSessionToken();
      await this.model.setSessionToken(member.id, sid);
      this.issueAuthCookie(res, member.id, member.role, sid);
      res.json({ success: true, role: member.role, displayName: member.display_name });
    } catch (e) {
      console.error('login 오류:', e);
      res.status(500).json({ success: false, error: '로그인 처리 중 오류가 발생했습니다.' });
    }
  };

  logout = async (_req: Request, res: Response): Promise<void> => {
    res.clearCookie(AUTH_COOKIE, { path: '/' });
    res.json({ success: true });
  };

  /** 본인 표시 이름 변경 (authGuard 보호). */
  updateProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      const memberId = req.member?.id;
      if (!memberId) {
        res.status(401).json({ success: false, error: '로그인이 필요합니다.' });
        return;
      }
      const displayName = (req.body?.displayName ?? '').toString().trim();
      if (displayName.length < 1 || displayName.length > 50) {
        res.status(400).json({ success: false, error: '이름은 1~50자로 입력해 주세요.' });
        return;
      }
      await this.model.updateDisplayName(memberId, displayName);
      res.json({ success: true, displayName });
    } catch (e) {
      console.error('updateProfile 오류:', e);
      res.status(500).json({ success: false, error: '이름 변경 중 오류가 발생했습니다.' });
    }
  };

  /** 본인 비밀번호 변경 (authGuard 보호). 현재 비번 확인 후 변경. */
  changePassword = async (req: Request, res: Response): Promise<void> => {
    try {
      const memberId = req.member?.id;
      if (!memberId) {
        res.status(401).json({ success: false, error: '로그인이 필요합니다.' });
        return;
      }
      const currentPassword = (req.body?.currentPassword ?? '').toString();
      const newPassword = (req.body?.newPassword ?? '').toString();
      if (!PW_RE.test(newPassword)) {
        res.status(400).json({ success: false, error: '새 비밀번호는 영문·숫자 6~30자로 입력해 주세요.' });
        return;
      }
      const member = await this.model.findById(memberId);
      if (!member || !member.password_hash) {
        // 앱 익명계정 등 비번이 없는 계정은 변경 불가
        res.status(400).json({ success: false, error: '비밀번호를 변경할 수 없는 계정입니다.' });
        return;
      }
      const ok = await bcrypt.compare(currentPassword, member.password_hash);
      if (!ok) {
        res.status(401).json({ success: false, error: '현재 비밀번호가 올바르지 않습니다.' });
        return;
      }
      const hash = await bcrypt.hash(newPassword, 10);
      await this.model.updatePassword(memberId, hash);
      res.json({ success: true });
    } catch (e) {
      console.error('changePassword 오류:', e);
      res.status(500).json({ success: false, error: '비밀번호 변경 중 오류가 발생했습니다.' });
    }
  };

  /**
   * 페이지 접근 기록 (게이트 밖, 비로그인 포함).
   * auth-gate.js가 모든 페이지 진입 시 호출. 로그인 상태면 member_id도 기록.
   */
  recordVisit = async (req: Request, res: Response): Promise<void> => {
    try {
      const path = (req.body?.path ?? '').toString();
      // 로그인 상태면 토큰에서 member_id 추출 (없어도 기록은 진행)
      const token = req.cookies?.[AUTH_COOKIE]
        || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
      const payload = token ? verifyToken(token) : null;
      await this.logModel.record(
        payload?.uid ?? null,
        null,
        'page_visit',
        clientIp(req),
        req.headers['user-agent'] as string || null,
        path || null
      );
      res.json({ success: true });
    } catch (e) {
      console.error('recordVisit 오류:', e);
      // 방문 기록 실패가 사용자 경험을 막으면 안 되므로 200으로 무시
      res.json({ success: false });
    }
  };

  /** 현재 로그인 상태 조회 (프론트가 진입 시 호출) */
  me = async (req: Request, res: Response): Promise<void> => {
    try {
      const token = req.cookies?.[AUTH_COOKIE]
        || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
      const payload = token ? verifyToken(token) : null;
      if (!payload) {
        res.json({ authenticated: false });
        return;
      }
      const member = await this.model.findById(payload.uid);
      if (!member) {
        res.json({ authenticated: false });
        return;
      }
      res.json({
        // 승인 + LawQuery 이용 허용이어야 로그인 상태로 본다(authGuard 와 같은 판정).
        // 허용이 꺼진 회원은 auth-gate 가 로그인 화면으로 보내고, 거기서 사유를 안내받는다.
        authenticated: member.status === 'approved' && hasLqAccess(member),
        lqAccess: hasLqAccess(member),
        status: member.status,
        role: member.role,
        loginId: member.login_id,
        displayName: member.display_name,
        source: member.signup_source,
        remember: payload.rmb === 1, // 로그인 유지 상태(회원바 체크박스 반영)
      });
    } catch (e) {
      console.error('me 오류:', e);
      res.status(500).json({ authenticated: false });
    }
  };

  /** "로그인 유지" 토글: 현재 세션(sid 유지)을 장기(30일)/단기(30분) 쿠키로 재발급. */
  setRemember = async (req: Request, res: Response): Promise<void> => {
    try {
      const token = req.cookies?.[AUTH_COOKIE]
        || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
      const payload = token ? verifyToken(token) : null;
      if (!payload) {
        res.status(401).json({ success: false, error: '로그인이 필요합니다.' });
        return;
      }
      const remember = !!req.body?.remember;
      const { expiresIn, maxAgeMs } = expiryFor(remember);
      const fresh = signToken(
        { uid: payload.uid, role: payload.role, sid: payload.sid, rmb: remember ? 1 : 0 },
        expiresIn
      );
      res.cookie(AUTH_COOKIE, fresh, cookieOptions(maxAgeMs));
      res.json({ success: true, remember });
    } catch (e) {
      console.error('setRemember 오류:', e);
      res.status(500).json({ success: false, error: '설정 변경 중 오류가 발생했습니다.' });
    }
  };

  // (제거됨) 앱 자동진입/자동가입(appEnter). 앱도 웹과 동일하게 이메일 가입만 사용한다.
}
