import { Request, Response, NextFunction } from 'express';
import { verifyToken, signToken, AUTH_COOKIE, cookieOptions } from '../utils/jwt';
import { MemberModel } from '../models/MemberModel';

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

/**
 * 토큰에서 JWT를 읽어 검증한다. 쿠키 우선, 없으면 Authorization: Bearer 헤더.
 */
function extractToken(req: Request): string | null {
  const cookieToken = req.cookies?.[AUTH_COOKIE];
  if (cookieToken) return cookieToken;
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

/**
 * 로그인 + 승인(approved) 상태여야 통과.
 * 보호 API(/api/law, /api/interpretation)에 적용.
 */
export async function authGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ success: false, error: '로그인이 필요합니다.', code: 'NO_AUTH' });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ success: false, error: '세션이 만료되었습니다. 다시 로그인해 주세요.', code: 'BAD_TOKEN' });
    return;
  }

  // 상태가 실시간으로 바뀔 수 있으므로(승인취소 등) DB로 최종 확인
  const member = await memberModel.findById(payload.uid);
  if (!member || member.status !== 'approved') {
    res.status(403).json({ success: false, error: '승인되지 않은 계정입니다.', code: 'NOT_APPROVED' });
    return;
  }

  // 중복 로그인 차단: 토큰의 sid가 DB의 최신 세션과 다르면 = 다른 기기에서 새로 로그인됨
  if (member.session_token && payload.sid !== member.session_token) {
    res.status(401).json({ success: false, error: '다른 기기에서 로그인되어 로그아웃되었습니다.', code: 'SESSION_REPLACED' });
    return;
  }

  // 슬라이딩 만료: 활동 중이면 토큰을 재발급해 만료 시계를 리셋(무활동 10분 타임아웃)
  const fresh = signToken({ uid: member.id, role: member.role, sid: payload.sid });
  res.cookie(AUTH_COOKIE, fresh, cookieOptions());

  req.member = { id: member.id, role: member.role, status: member.status };
  next();
}

/** 관리자 전용. authGuard 통과 후 role=admin 확인. */
export async function adminGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  // adminGuard는 authGuard 뒤에 체이닝되거나 단독 사용 가능하도록 토큰을 다시 확인
  const token = extractToken(req);
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    res.status(401).json({ success: false, error: '로그인이 필요합니다.', code: 'NO_AUTH' });
    return;
  }
  const member = await memberModel.findById(payload.uid);
  if (!member || member.role !== 'admin' || member.status !== 'approved') {
    res.status(403).json({ success: false, error: '관리자 권한이 필요합니다.', code: 'NOT_ADMIN' });
    return;
  }
  req.member = { id: member.id, role: member.role, status: member.status };
  next();
}
