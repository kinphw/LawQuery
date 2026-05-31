import jwt from 'jsonwebtoken';

export interface JwtPayload {
  uid: number;
  role: 'user' | 'admin';
}

const SECRET = process.env.JWT_SECRET || 'dev-secret';
const EXPIRES = process.env.JWT_EXPIRES || '30d';

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

/** 쿠키 이름 통일 */
export const AUTH_COOKIE = 'lq_token';

/** httpOnly 쿠키 옵션. TWA(크롬)·웹 모두 호환되도록 lax. */
export function cookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,            // 운영(HTTPS)에서만 secure
    sameSite: 'lax' as const,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30일
    path: '/',
  };
}
