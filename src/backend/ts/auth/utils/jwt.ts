import jwt from 'jsonwebtoken';
import crypto from 'crypto';

export interface JwtPayload {
  uid: number;
  role: 'user' | 'admin';
  sid: string; // 세션 식별자(중복 로그인 차단용). DB의 member.session_token과 일치해야 유효.
  rmb?: number; // 1 = "로그인 유지"(장기 세션). 미지정/0 = 기본 단기 세션.
}

const SECRET = process.env.JWT_SECRET || 'dev-secret';
// 무활동 만료(슬라이딩): 매 인증요청마다 토큰을 갱신 → "이 기간 동안 활동이 없으면 로그아웃".
// 기본(단기) 30분. "로그인 유지" 선택 시 장기(기본 30일)로 슬라이딩.
const SHORT_EXPIRES = process.env.JWT_EXPIRES || '30m';
const LONG_EXPIRES = process.env.JWT_REMEMBER_EXPIRES || '30d';

function toMs(s: string): number {
  const m = /^(\d+)m$/.exec(s);
  const h = /^(\d+)h$/.exec(s);
  const d = /^(\d+)d$/.exec(s);
  if (m) return parseInt(m[1], 10) * 60 * 1000;
  if (h) return parseInt(h[1], 10) * 60 * 60 * 1000;
  if (d) return parseInt(d[1], 10) * 24 * 60 * 60 * 1000;
  return 30 * 60 * 1000;
}

export const SHORT_MS = toMs(SHORT_EXPIRES);
export const LONG_MS = toMs(LONG_EXPIRES);

/** remember(로그인 유지) 여부에 따른 만료 설정. */
export function expiryFor(remember: boolean): { expiresIn: string; maxAgeMs: number } {
  return remember
    ? { expiresIn: LONG_EXPIRES, maxAgeMs: LONG_MS }
    : { expiresIn: SHORT_EXPIRES, maxAgeMs: SHORT_MS };
}

export function signToken(payload: JwtPayload, expiresIn: string = SHORT_EXPIRES): string {
  return jwt.sign(payload, SECRET, { expiresIn } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

/** 새 세션 식별자 생성 (로그인 시). */
export function newSessionToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

/** 쿠키 이름 통일 */
export const AUTH_COOKIE = 'lq_token';

/** httpOnly 쿠키 옵션. maxAge는 JWT 수명과 동기(기본 단기). 로그인 유지 시 LONG_MS 전달. */
export function cookieOptions(maxAgeMs: number = SHORT_MS) {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,            // 운영(HTTPS)에서만 secure
    sameSite: 'lax' as const,
    maxAge: maxAgeMs,
    path: '/',
  };
}
