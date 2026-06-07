import jwt from 'jsonwebtoken';
import crypto from 'crypto';

export interface JwtPayload {
  uid: number;
  role: 'user' | 'admin';
  sid: string; // 세션 식별자(중복 로그인 차단용). DB의 member.session_token과 일치해야 유효.
}

const SECRET = process.env.JWT_SECRET || 'dev-secret';
// 무활동 만료(슬라이딩): 매 인증요청마다 토큰을 갱신 → "이 기간 동안 활동이 없으면 로그아웃".
// 활동 중이면 계속 연장되므로, 사실상 "○○ 이상 미접속 시 자동 로그아웃" 의미. 기본 30분.
const EXPIRES = process.env.JWT_EXPIRES || '30m';

// 쿠키 maxAge(ms). JWT 수명과 맞춘다. 기본 30분.
const COOKIE_MAX_AGE_MS = (() => {
  const m = /^(\d+)m$/.exec(EXPIRES);
  const h = /^(\d+)h$/.exec(EXPIRES);
  const d = /^(\d+)d$/.exec(EXPIRES);
  if (m) return parseInt(m[1], 10) * 60 * 1000;
  if (h) return parseInt(h[1], 10) * 60 * 60 * 1000;
  if (d) return parseInt(d[1], 10) * 24 * 60 * 60 * 1000;
  return 10 * 60 * 1000;
})();

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

/** 새 세션 식별자 생성 (로그인/앱진입 시). */
export function newSessionToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

/** 쿠키 이름 통일 */
export const AUTH_COOKIE = 'lq_token';

/** httpOnly 쿠키 옵션. TWA(크롬)·웹 모두 호환되도록 lax. maxAge는 JWT 수명과 동기. */
export function cookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,            // 운영(HTTPS)에서만 secure
    sameSite: 'lax' as const,
    maxAge: COOKIE_MAX_AGE_MS,
    path: '/',
  };
}
