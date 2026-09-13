import { Request, Response, NextFunction } from 'express';
import { verifyToken, signToken, AUTH_COOKIE, cookieOptions, expiryFor } from '../utils/jwt';
import { MemberModel, Member } from '../models/MemberModel';

// Express Request에 인증 사용자 정보 부착
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      member?: { id: number; role: 'user' | 'admin'; status: string };
    }
  }
}

const memberModel = new MemberModel();

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
  | { ok: false; code: 'NO_AUTH' | 'BAD_TOKEN' | 'NOT_APPROVED' }
> {
  const token = extractToken(req);
  if (!token) return { ok: false, code: 'NO_AUTH' };
  const payload = verifyToken(token);
  if (!payload) return { ok: false, code: 'BAD_TOKEN' };

  const member = await memberModel.findById(payload.uid);
  if (!member || member.status !== 'approved') return { ok: false, code: 'NOT_APPROVED' };
  // 다중 세션 허용: 같은 계정의 웹·앱·여러 기기 동시 로그인을 허용한다(sid 검증 없음).

  // 슬라이딩 만료: 활동 시 토큰 재발급. "로그인 유지"(rmb) 여부와 그 만료를 그대로 유지.
  const { expiresIn, maxAgeMs } = expiryFor(payload.rmb === 1);
  const fresh = signToken({ uid: member.id, role: member.role, sid: payload.sid, rmb: payload.rmb }, expiresIn);
  res.cookie(AUTH_COOKIE, fresh, cookieOptions(maxAgeMs));

  req.member = { id: member.id, role: member.role, status: member.status };
  return { ok: true, member };
}

/**
 * 로그인+승인 필수.
 * index.ts 가 /api 전체에 한 번 걸어두므로, 개별 라우터는 따로 붙이지 않는다
 * (붙이면 요청당 회원 조회가 중복된다).
 */
export async function authGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  const r = await resolveMember(req, res);
  if (r.ok) { next(); return; }
  const msg = r.code === 'NOT_APPROVED' ? '승인되지 않은 계정입니다.'
    : r.code === 'BAD_TOKEN' ? '세션이 만료되었습니다. 다시 로그인해 주세요.'
    : '로그인이 필요합니다.';
  const status = r.code === 'NOT_APPROVED' ? 403 : 401;
  res.status(status).json({ success: false, error: msg, code: r.code });
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
