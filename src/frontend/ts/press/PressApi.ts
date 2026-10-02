export interface PressSource {
  code: string;
  name: string;
  docs: number;
  posts: number;
  first: string | null;
  last: string | null;
}

export interface PressItem {
  id: number;
  source: string;
  /** 같은 게시물(본문·별첨)을 묶는 키 */
  postKey: string;
  date: string | null;
  title: string;
  fileName: string;
  ext: string;
  chars: number;
  /** 본문에 검색어가 있었는지(없으면 제목·파일명만 일치) */
  hit: boolean;
  snippet: string;
  /** 미리보기가 본문 중간에서 시작하는지 */
  cut: boolean;
}

export interface PressFile {
  id: number;
  name: string;
  ext: string;
  chars: number;
  how: 'pdf' | 'convert' | 'none';
  ready: boolean;
  size: number;
}

export interface PressDoc {
  id: number;
  source: string;
  sourceName: string;
  date: string | null;
  title: string;
  fileName: string;
  postUrl: string | null;
  content: string;
}

export interface PressQuery {
  q: string;
  in: 'all' | 'title' | 'body';
  source: string[];
  from: string;
  to: string;
}

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
  let body: any = null;
  try { body = await r.json(); } catch { /* 글로 된 답이 아님 */ }
  if (!r.ok || !body?.success) throw new Error(body?.error || `요청 실패(${r.status})`);
  return body as T;
}

function qs(p: PressQuery, extra: Record<string, string> = {}): string {
  const sp = new URLSearchParams();
  if (p.q) sp.set('q', p.q);
  if (p.in !== 'all') sp.set('in', p.in);
  if (p.source.length) sp.set('source', p.source.join(','));
  if (p.from) sp.set('from', p.from);
  if (p.to) sp.set('to', p.to);
  for (const [k, v] of Object.entries(extra)) sp.set(k, v);
  return sp.toString();
}

export const pressApi = {
  sources: () => get<{ sources: PressSource[] }>('/api/press/sources'),
  search: (p: PressQuery, page: number) =>
    get<{ tokens: string[]; page: number; more: boolean; items: PressItem[] }>(`/api/press/search?${qs(p, { page: String(page) })}`),
  count: (p: PressQuery) => get<{ total: number; bySource: Record<string, number> }>(`/api/press/count?${qs(p)}`),
  doc: (id: number) => get<{ doc: PressDoc; files: PressFile[] }>(`/api/press/doc/${id}`),
  originalUrl: (id: number) => `/api/press/original/${id}`,
  rawUrl: (id: number) => `/api/press/original/${id}?raw=1`,
};
