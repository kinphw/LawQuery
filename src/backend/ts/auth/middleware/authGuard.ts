import { Request, Response, NextFunction } from 'express';
import { verifyToken, signToken, AUTH_COOKIE, cookieOptions, expiryFor } from '../utils/jwt';
import { MemberModel, Member, effectivePlan } from '../models/MemberModel';

export type MemberPlan = 'free' | 'pro';

// Express Request에 인증 사용자 정보 부착
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      member?: { id: number; role: 'user' | 'admin'; status: string; plan: MemberPlan };
    }
  }
}

const memberModel = new MemberModel();

/** pro(킬 기능 접근). 베타엔 가입자에게 무기한 pro 부여, 유료화는 plan_expires_at로 처리. */
export function isPro(plan?: MemberPlan): boolean {
  return plan === 'pro';
}

function extractToken(req: Request): string | null {
  const cookieToken = req.cookies?.[AUTH_COOKIE];
  if (cookieToken) return cookieToken;
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

/**
 * 토큰을 검증하고 승인된 회원이면 member 객체를 반환(+슬라이딩 토큰 갱신).
 * 실패 사유를 code로 구분. (게이트들이 공통으로 사용)
 */
async function resolveMember(req: Request, res: Response): Promise<
  | { ok: true; member: Member }
  | { ok: false; code: 'NO_AUTH' | 'BAD_TOKEN' | 'NOT_APPROVED' | 'SESSION_REPLACED' }
> {
  const token = extractToken(req);
  if (!token) return { ok: false, code: 'NO_AUTH' };
  const payload = verifyToken(token);
  if (!payload) return { ok: false, code: 'BAD_TOKEN' };

  const member = await memberModel.findById(payload.uid);
  if (!member || member.status !== 'approved') return { ok: false, code: 'NOT_APPROVED' };
  // 다중 세션 허용: 같은 계정의 웹·앱·여러 기기 동시 로그인을 허용한다.
  // (이전엔 sid 불일치 시 SESSION_REPLACED 로 차단했는데, /api/auth/me 는 sid 를 검증하지 않아
  //  "상태바엔 PRO인데 콘텐츠는 티저"가 발생했다 → 게이트의 sid 검증 제거.)
  // ▶ 계정 공유 방지가 필요해지면 여기서 sid 검증을 되살리되, me(AuthController)도 함께 sid 를 검증해 일관성을 맞출 것.

  // 슬라이딩 만료: 활동 시 토큰 재발급. "로그인 유지"(rmb) 여부와 그 만료를 그대로 유지.
  const { expiresIn, maxAgeMs } = expiryFor(payload.rmb === 1);
  const fresh = signToken({ uid: member.id, role: member.role, sid: payload.sid, rmb: payload.rmb }, expiresIn);
  res.cookie(AUTH_COOKIE, fresh, cookieOptions(maxAgeMs));

  // 만료 반영 실효 등급(베타엔 NULL이라 원래 plan 그대로). proGuard가 이 값으로 판정.
  req.member = { id: member.id, role: member.role, status: member.status, plan: effectivePlan(member) };
  return { ok: true, member };
}

/**
 * 로그인+승인 필수. (기존 보호 API 호환용 — 현재는 거의 proGuard로 대체)
 */
export async function authGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  const r = await resolveMember(req, res);
  if (r.ok) { next(); return; }
  const msg = r.code === 'SESSION_REPLACED' ? '다른 기기에서 로그인되어 로그아웃되었습니다.'
    : r.code === 'NOT_APPROVED' ? '승인되지 않은 계정입니다.'
    : r.code === 'BAD_TOKEN' ? '세션이 만료되었습니다. 다시 로그인해 주세요.'
    : '로그인이 필요합니다.';
  const status = r.code === 'NOT_APPROVED' ? 403 : 401;
  res.status(status).json({ success: false, error: msg, code: r.code });
}

/**
 * 선택적 인증: 로그인 안 해도 통과(비회원 허용). 로그인했으면 req.member 부착.
 * → 비회원도 보는 "단일 법령 본문" 등 무료 API에 사용.
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req);
  if (!token) { next(); return; }          // 비회원 → 그냥 통과
  await resolveMember(req, res);            // 성공 시 req.member 부착, 실패해도 통과(비회원 취급)
  next();
}

/**
 * PRO 게이트: 로그인 + 승인 + pro만 통과.
 * → 킬 기능(연계표·벌칙·참조·별표·유권해석)에 사용.
 * 비회원/미승인/무료(free)는 차단하되 code로 구분(프론트가 잠금 UI 분기).
 */
export async function proGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  const r = await resolveMember(req, res);
  if (!r.ok) {
    const status = r.code === 'NOT_APPROVED' ? 403 : 401;
    const msg = r.code === 'NO_AUTH' ? '로그인이 필요합니다.'
      : r.code === 'SESSION_REPLACED' ? '다른 기기에서 로그인되어 로그아웃되었습니다.'
      : r.code === 'NOT_APPROVED' ? '승인되지 않은 계정입니다.'
      : '세션이 만료되었습니다. 다시 로그인해 주세요.';
    res.status(status).json({ success: false, error: msg, code: r.code });
    return;
  }
  if (!isPro(r.member.plan)) {
    res.status(403).json({ success: false, error: 'PRO 전용 기능입니다.', code: 'PRO_REQUIRED' });
    return;
  }
  next();
}

/** 관리자 전용. */
export async function adminGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  const r = await resolveMember(req, res);
  if (!r.ok || r.member.role !== 'admin') {
    res.status(r.ok ? 403 : 401).json({ success: false, error: '관리자 권한이 필요합니다.', code: 'NOT_ADMIN' });
    return;
  }
  next();
}
