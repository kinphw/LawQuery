import { Request, Response, NextFunction } from 'express';

/**
 * 의존성 없는 인메모리 rate limiter(고정 윈도우). 단일 프로세스(pm2 fork)라 별도 스토어 불필요.
 * 브루트포스/남용 방지용 — 로그인·회원가입·인증코드 재전송/확인 등 민감 엔드포인트에 붙인다.
 *
 * 키 = 클라이언트 IP(req.ip). 정직한 사용자는 아파치가 넘긴 실제 IP로 잡힌다.
 * (index.ts 의 trust proxy 참고: 현재 'true'라 X-Forwarded-For 위조 시 우회 여지 있음 — 방어층 중 하나.)
 */
interface Bucket { count: number; resetAt: number; }

export function rateLimit(opts: { windowMs: number; max: number; message?: string }) {
  const { windowMs, max } = opts;
  const message = opts.message || '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
  const hits = new Map<string, Bucket>();

  // 만료 버킷 주기적 청소 → 메모리 무한 증가 방지. unref 로 프로세스 종료를 막지 않게.
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of hits) if (b.resetAt <= now) hits.delete(k);
  }, windowMs);
  if (typeof timer.unref === 'function') timer.unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = clientKey(req);
    let b = hits.get(key);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + windowMs };
      hits.set(key, b);
    }
    b.count++;
    if (b.count > max) {
      const retryAfter = Math.max(1, Math.ceil((b.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({ success: false, error: message, code: 'RATE_LIMITED' });
      return;
    }
    next();
  };
}

function clientKey(req: Request): string {
  let ip = req.ip || req.socket?.remoteAddress || 'unknown';
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  return ip;
}
