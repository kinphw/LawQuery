import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { MemberModel, effectivePlan } from '../models/MemberModel';
import { AccessLogModel } from '../models/AccessLogModel';
import { SettingModel } from '../models/SettingModel';
import { signToken, verifyToken, newSessionToken, AUTH_COOKIE, cookieOptions } from '../utils/jwt';

// 로그인 ID = 이메일(회원 확대용). 간단 형식 검증(인증메일 단계는 없음).
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

  /** 웹 회원가입: status=pending. 단, ADMIN_EMAIL과 일치하면 admin+approved 자동. */
  register = async (req: Request, res: Response): Promise<void> => {
    try {
      const loginId = (req.body?.loginId ?? req.body?.email ?? '').trim().toLowerCase();
      const password = req.body?.password ?? '';
      const displayName = (req.body?.displayName ?? '').trim() || null;
      // 직군/소속 수집 (B2B 자산). 화이트리스트만 허용.
      const OCC = ['회계사', '세무사', '금융회사', '회계팀', '법무팀', '학생', '기타'];
      const occRaw = (req.body?.occupation ?? '').toString().trim();
      const occupation = OCC.includes(occRaw) ? occRaw : null;

      if (!EMAIL_RE.test(loginId)) {
        res.status(400).json({ success: false, error: '올바른 이메일 주소를 입력해 주세요.' });
        return;
      }
      if (typeof password !== 'string' || !PW_RE.test(password)) {
        res.status(400).json({ success: false, error: '비밀번호는 영문·숫자 6~30자로 입력해 주세요.' });
        return;
      }

      const existing = await this.model.findByLoginId(loginId);
      if (existing) {
        res.status(409).json({ success: false, error: '이미 가입된 이메일입니다.' });
        return;
      }

      // 최초 가입자(회원 0명)는 자동으로 관리자 + 승인 → 설정에 관리자 ID를 둘 필요 없음
      const isAdmin = (await this.model.countMembers()) === 0;

      // 가입 허용 off면 차단 (단, 최초 관리자 가입은 항상 허용)
      if (!isAdmin && !(await this.settingModel.isSignupEnabled())) {
        res.status(403).json({ success: false, error: '현재 신규 가입이 중단되었습니다.' });
        return;
      }

      const hash = await bcrypt.hash(password, 10);
      // 무료 베타: 가입 즉시 자동 승인 + plan=pro_beta 무기한(킬 기능 베타 개방). 악용 시 관리자 사후 정지.
      // ▶ 정식 출시(결제 오픈) 시 30일 트라이얼 전환: 아래 8번째 인자로 만료시각을 넘기면 됨.
      //   예) const expires = new Date(Date.now() + 30*864e5).toISOString().slice(0,19).replace('T',' ');
      //       createWebMember(..., occupation, expires)
      const id = await this.model.createWebMember(
        loginId,
        hash,
        displayName,
        isAdmin ? 'admin' : 'user',
        'approved',
        'pro_beta',
        occupation
        // , planExpiresAt  ← 출시 때 활성화
      );

      // 가입 즉시 로그인 처리(관리자/일반 공통)
      const sid = newSessionToken();
      await this.model.setSessionToken(id, sid);
      const token = signToken({ uid: id, role: isAdmin ? 'admin' : 'user', sid });
      res.cookie(AUTH_COOKIE, token, cookieOptions());
      res.json({
        success: true,
        status: 'approved',
        role: isAdmin ? 'admin' : 'user',
        message: isAdmin ? '관리자 계정으로 가입되었습니다.' : '가입이 완료되었습니다.',
      });
    } catch (e) {
      console.error('register 오류:', e);
      res.status(500).json({ success: false, error: '가입 처리 중 오류가 발생했습니다.' });
    }
  };

  /** 로그인: 승인된 계정만 JWT 발급 */
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
      if (member.status !== 'approved') {
        await this.logModel.record(member.id, member.login_id, 'login_fail', clientIp(req), ua);
        const msg =
          member.status === 'pending' ? '아직 승인 대기 중입니다.'
          : member.status === 'rejected' ? '가입이 거부된 계정입니다.'
          : '이용이 정지된 계정입니다.';
        res.status(403).json({ success: false, error: msg, status: member.status });
        return;
      }

      await this.model.touchLogin(member.id);
      await this.logModel.record(member.id, member.login_id, 'login', clientIp(req), req.headers['user-agent'] as string || null);
      // 중복 로그인 차단: 새 세션 토큰 발급 → 기존 기기 세션 무효화
      const sid = newSessionToken();
      await this.model.setSessionToken(member.id, sid);
      const token = signToken({ uid: member.id, role: member.role, sid });
      res.cookie(AUTH_COOKIE, token, cookieOptions());
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
        authenticated: member.status === 'approved',
        status: member.status,
        role: member.role,
        plan: effectivePlan(member), // 만료 반영 실효 등급(베타엔 원래 plan과 동일)
        planExpiresAt: member.plan_expires_at, // 프론트 "n일 남음" 표시용(현재 NULL)
        loginId: member.login_id,
        displayName: member.display_name,
        source: member.signup_source,
      });
    } catch (e) {
      console.error('me 오류:', e);
      res.status(500).json({ authenticated: false });
    }
  };

  /**
   * 앱 자동진입: 앱이 보낸 비밀토큰(t)을 검증.
   * 통과 시 deviceKey 기준으로 익명계정을 찾거나 새로 만들고(approved) JWT 발급.
   */
  appEnter = async (req: Request, res: Response): Promise<void> => {
    try {
      const t = (req.body?.t ?? '').toString();
      const deviceKey = (req.body?.deviceKey ?? '').toString().trim();

      if (!t || t !== (process.env.APP_TOKEN || '')) {
        res.status(401).json({ success: false, error: '유효하지 않은 앱 토큰입니다.' });
        return;
      }
      if (!deviceKey || deviceKey.length < 8 || deviceKey.length > 64) {
        res.status(400).json({ success: false, error: '잘못된 기기 식별자입니다.' });
        return;
      }

      let member = await this.model.findByDeviceKey(deviceKey);
      if (!member) {
        const appLoginId = `device_${deviceKey}`;
        const id = await this.model.createAppMember(appLoginId, deviceKey);
        member = await this.model.findById(id);
      }
      if (!member) {
        res.status(500).json({ success: false, error: '계정 생성에 실패했습니다.' });
        return;
      }

      // 앱 계정이 혹시 정지되었으면 차단
      if (member.status !== 'approved') {
        res.status(403).json({ success: false, error: '이용이 제한된 계정입니다.', status: member.status });
        return;
      }

      await this.model.touchLogin(member.id);
      await this.logModel.record(member.id, member.login_id, 'app_enter', clientIp(req), req.headers['user-agent'] as string || null);
      const sid = newSessionToken();
      await this.model.setSessionToken(member.id, sid);
      const token = signToken({ uid: member.id, role: member.role, sid });
      res.cookie(AUTH_COOKIE, token, cookieOptions());
      res.json({ success: true, role: member.role });
    } catch (e) {
      console.error('appEnter 오류:', e);
      res.status(500).json({ success: false, error: '앱 진입 처리 중 오류가 발생했습니다.' });
    }
  };
}
