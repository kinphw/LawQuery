/**
 * AuthState — 프론트 공통 인증/등급 상태.
 *
 * auth-gate.js가 <head>에서 먼저 /api/auth/me를 호출하고 그 Promise를
 * window.__lqMePromise로 노출한다. 번들은 이를 재사용해 중복 fetch를 피한다.
 * (없으면 직접 fetch — dev/단독 로드 대비)
 */
export interface MeInfo {
  authenticated: boolean;
  status?: string;
  role?: 'user' | 'admin';
  plan?: 'free' | 'pro'; // 서버가 만료 반영한 실효 등급
  planExpiresAt?: string | null;     // PRO 만료 시각(현재 베타엔 null). 향후 "n일 남음" 표시용
  loginId?: string;
  displayName?: string;
  source?: 'web' | 'app';
}

let cached: Promise<MeInfo> | null = null;

export function getMe(): Promise<MeInfo> {
  if (cached) return cached;
  const w = window as any;
  if (w.__lqMePromise) {
    cached = Promise.resolve(w.__lqMePromise).catch(() => ({ authenticated: false }));
    return cached;
  }
  cached = fetch('/api/auth/me', { headers: { Accept: 'application/json' } })
    .then((r) => r.json())
    .catch(() => ({ authenticated: false } as MeInfo));
  return cached;
}

/** pro면 킬 기능 접근 가능(서버가 만료 반영한 실효 등급 기준). */
export function isPro(me: MeInfo): boolean {
  return me.plan === 'pro';
}
