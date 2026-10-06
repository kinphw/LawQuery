/**
 * 판례 API(/api/prec) — 백엔드가 법제처 공동활용 API 를 그때그때 불러 준다(DB 적재 없음).
 * 법원 판례와 헌법재판소 결정례가 한 목록으로 온다. 헌재 것은 id 가 `c` 로 시작한다.
 */
export type PrecSrc = 'prec' | 'detc';

export interface PrecItem {
  id: string;
  src: PrecSrc;
  caseNo: string;
  title: string;
  date: string;
  court: string;
  kind: string;
  type: string;
  source: string;
}

export interface PrecDetail extends PrecItem {
  holding: string;
  summary: string;
  /** 심판대상조문(헌재결정) */
  target: string;
  refLaws: string;
  refCases: string;
  body: string;
}

export interface PrecQuery {
  /** 검색어. 큰따옴표로 묶으면 문구 그대로. */
  q?: string;
  /** 찾을 곳 — body(기본)·title(사건명·사건번호) */
  in?: 'body' | 'title';
  /** 출처 — all(기본)·prec(법원 판례)·detc(헌재결정) */
  src?: 'all' | PrecSrc;
  /** 참조법령명(법원 판례만) */
  jo?: string;
}

export interface PrecPage {
  total: number;
  counts: Partial<Record<PrecSrc, number>>;
  page: number;
  size: number;
  /** 실제로 찾은 곳(사건번호 꼴이면 서버가 title 로 바꾼다) */
  in: 'body' | 'title';
  more: boolean;
  items: PrecItem[];
}

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: 'same-origin' });
  let j: any = null;
  try { j = await r.json(); } catch { /* 글로 된 답이 아님 */ }
  if (!r.ok || !j?.success) throw new Error(j?.error || '판례를 불러오지 못했습니다.');
  return j as T;
}

export const precApi = {
  search(q: PrecQuery, page = 1): Promise<PrecPage> {
    const sp = new URLSearchParams({ page: String(page) });
    if (q.q) sp.set('q', q.q);
    if (q.in === 'title') sp.set('in', 'title');
    if (q.src && q.src !== 'all') sp.set('src', q.src);
    if (q.jo) sp.set('jo', q.jo);
    return get<PrecPage>(`/api/prec/search?${sp}`);
  },
  detail(id: string): Promise<PrecDetail> {
    return get<{ data: PrecDetail }>(`/api/prec/detail/${encodeURIComponent(id)}`).then((r) => r.data);
  },
  /** 법제처 국가법령정보센터의 판례·헌재결정 화면 */
  publicUrl: (id: string) => (id.startsWith('c')
    ? `https://www.law.go.kr/detcInfoP.do?detcSeq=${encodeURIComponent(id.slice(1))}`
    : `https://www.law.go.kr/precInfoP.do?precSeq=${encodeURIComponent(id)}`),
};
