import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { MemberModel } from '../models/MemberModel';
import { signToken, verifyToken, AUTH_COOKIE, cookieOptions } from '../utils/jwt';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class AuthController {
  private model: MemberModel;

  constructor() {
    this.model = new MemberModel();
  }

  /** 웹 회원가입: status=pending. 단, ADMIN_EMAIL과 일치하면 admin+approved 자동. */
  register = async (req: Request, res: Response): Promise<void> => {
    try {
      const email = (req.body?.email ?? '').trim().toLowerCase();
      const password = req.body?.password ?? '';
      const displayName = (req.body?.displayName ?? '').trim() || null;

      if (!EMAIL_RE.test(email)) {
        res.status(400).json({ success: false, error: '올바른 이메일을 입력해 주세요.' });
        return;
      }
      if (typeof password !== 'string' || password.length < 6) {
        res.status(400).json({ success: false, error: '비밀번호는 6자 이상이어야 합니다.' });
        return;
      }

      const existing = await this.model.findByEmail(email);
      if (existing) {
        res.status(409).json({ success: false, error: '이미 가입된 이메일입니다.' });
        return;
      }

      const hash = await bcrypt.hash(password, 10);

      // 관리자 이메일이면 자동 admin + approved
      const isAdmin = email === (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
      const id = await this.model.createWebMember(
        email,
        hash,
        displayName,
        isAdmin ? 'admin' : 'user',
        isAdmin ? 'approved' : 'pending'
      );

      if (isAdmin) {
        // 관리자는 즉시 로그인 처리
        const token = signToken({ uid: id, role: 'admin' });
        res.cookie(AUTH_COOKIE, token, cookieOptions());
        res.json({ success: true, status: 'approved', role: 'admin', message: '관리자 계정으로 가입되었습니다.' });
        return;
      }

      res.json({
        success: true,
        status: 'pending',
        message: '가입 신청이 완료되었습니다. 관리자 승인 후 이용하실 수 있습니다.',
      });
    } catch (e) {
      console.error('register 오류:', e);
      res.status(500).json({ success: false, error: '가입 처리 중 오류가 발생했습니다.' });
    }
  };

  /** 로그인: 승인된 계정만 JWT 발급 */
  login = async (req: Request, res: Response): Promise<void> => {
    try {
      const email = (req.body?.email ?? '').trim().toLowerCase();
      const password = req.body?.password ?? '';

      const member = await this.model.findByEmail(email);
      if (!member || !member.password_hash) {
        res.status(401).json({ success: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
        return;
      }
      const ok = await bcrypt.compare(password, member.password_hash);
      if (!ok) {
        res.status(401).json({ success: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
        return;
      }
      if (member.status !== 'approved') {
        const msg =
          member.status === 'pending' ? '아직 승인 대기 중입니다.'
          : member.status === 'rejected' ? '가입이 거부된 계정입니다.'
          : '이용이 정지된 계정입니다.';
        res.status(403).json({ success: false, error: msg, status: member.status });
        return;
      }

      await this.model.touchLogin(member.id);
      const token = signToken({ uid: member.id, role: member.role });
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
        const email = `device_${deviceKey}@auto.lq`;
        const id = await this.model.createAppMember(email, deviceKey);
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
      const token = signToken({ uid: member.id, role: member.role });
      res.cookie(AUTH_COOKIE, token, cookieOptions());
      res.json({ success: true, role: member.role });
    } catch (e) {
      console.error('appEnter 오류:', e);
      res.status(500).json({ success: false, error: '앱 진입 처리 중 오류가 발생했습니다.' });
    }
  };
}
