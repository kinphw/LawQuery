/**
 * 판례·헌재결정 — 국가법령정보 공동활용 API(law.go.kr DRF)를 그때그때 부른다. **DB 에 적재하지 않는다.**
 *
 * - 두 출처를 한 목록으로 준다: 법원 판례(`target=prec`) + 헌법재판소 결정례(`target=detc`). 같은 인증값·같은 꼴이다.
 *   읽는 사람에겐 둘 다 '판례'라 화면도 한 검색창이다. 헌재 것은 id 앞에 `c` 를 붙여 구분한다(`c205945`).
 * - 인증값은 `.env` 의 `LAW_OC`(LawQuery-law 적재 파이프라인·센티넬 MCP 가 쓰는 것과 같은 값).
 * - 같은 요청은 메모리에 하루 둔다(판례는 자주 바뀌지 않고, 조문 단추를 여러 번 누르는 일이 흔하다).
 *   두 출처를 날짜순으로 합칠 때 앞쪽 쪽들을 다시 읽는데, 이 캐시 덕에 실제 호출은 쪽당 한 번이다.
 * - 응답의 상세링크는 OC 가 박힌 주소라 화면에 내보내지 않는다 — 공개 주소는 일련번호로 짠다.
 * - 본문은 `<br/>` 섞인 글이라 태그를 걷어 낸 순수 글자로 준다(화면이 escape 해서 그린다).
 */
const BASE_URL = 'https://www.law.go.kr/DRF';
const TTL_MS = 24 * 3600 * 1000;
const MAX_ENTRIES = 1500;
const TIMEOUT_MS = 15_000;
export const PAGE_SIZE = 20;
/** 합친 목록에서 넘길 수 있는 쪽 수 — 한 쪽을 주려면 출처마다 앞쪽을 다 읽어야 해서 끝을 둔다. */
export const MAX_MERGED_PAGE = 25;

export class PrecError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export type PrecSrc = 'prec' | 'detc';

export interface PrecSearchParams {
  /** 검색어. 큰따옴표로 묶으면 문구 그대로. */
  query?: string;
  /** 1: 사건명·사건번호 · 2: 본문 */
  search?: 1 | 2;
  /** 참조법령명(참조조문에 이 법령이 있는 판례) — 법원 판례에만 있는 조건 */
  jo?: string;
  sources: PrecSrc[];
  page: number;
}

export interface PrecItem {
  /** 판례일련번호. 헌재결정은 앞에 c */
  id: string;
  src: PrecSrc;
  caseNo: string;
  title: string;
  date: string;
  court: string;
  kind: string;
  type: string;
  /** 법제처가 가져온 곳(대법원 종합법률정보·국세법령정보시스템 등) */
  source: string;
}

export interface PrecDetail extends PrecItem {
  holding: string;   // 판시사항
  summary: string;   // 판결요지 · 결정요지
  target: string;    // 심판대상조문(헌재)
  refLaws: string;   // 참조조문
  refCases: string;  // 참조판례
  body: string;      // 판례내용 · 전문
}

export interface PrecSearchResult {
  total: number;
  /** 출처별 건수 — 찾지 않은 출처는 빠진다 */
  counts: Partial<Record<PrecSrc, number>>;
  items: PrecItem[];
  /** 다음 쪽이 있는가 */
  more: boolean;
}

const cache = new Map<string, { at: number; value: unknown }>();

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return Promise.resolve(hit.value as T);
  return load().then((value) => {
    if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
    cache.set(key, { at: Date.now(), value });
    return value;
  });
}

async function call(path: string, target: PrecSrc, params: Record<string, string | number>): Promise<any> {
  const oc = process.env.LAW_OC;
  if (!oc) throw new PrecError(503, '판례 API 인증값(LAW_OC)이 설정되지 않았습니다.');
  const qs = new URLSearchParams({ OC: oc, target, type: 'JSON' });
  for (const [k, v] of Object.entries(params)) qs.set(k, String(v));
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/${path}?${qs}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new PrecError(502, '법제처 판례 API 에 연결하지 못했습니다.');
  }
  if (!res.ok) throw new PrecError(502, `법제처 판례 API 응답 오류(${res.status})`);
  try {
    return await res.json();
  } catch {
    // 인증 실패·점검 때는 JSON 대신 안내 HTML 이 온다
    throw new PrecError(502, '법제처 판례 API 가 올바른 응답을 주지 않았습니다.');
  }
}

/** `<br/>` → 줄바꿈, 나머지 태그·엔티티 정리. */
function clean(raw: unknown): string {
  if (raw == null) return '';
  return String(raw)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** "20250626" → "2025.06.26" (목록은 이미 점 찍힌 꼴로 온다) */
function date(raw: unknown): string {
  const s = String(raw ?? '').trim();
  return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6)}` : s;
}

const precItem = (r: any, id: string): PrecItem => ({
  id,
  src: 'prec',
  caseNo: clean(r.사건번호),
  title: clean(r.사건명),
  date: date(r.선고일자),
  court: clean(r.법원명),
  kind: clean(r.사건종류명),
  type: clean(r.판결유형),
  source: clean(r.데이터출처명),
});

const detcItem = (r: any, id: string): PrecItem => ({
  id: `c${id}`,
  src: 'detc',
  caseNo: clean(r.사건번호),
  title: clean(r.사건명),
  date: date(r.종국일자),
  court: '헌법재판소',
  kind: clean(r.사건종류명),
  type: '',
  source: '',
});

/** 한 출처의 한 쪽(선고일·종국일 최신순). */
function searchOne(src: PrecSrc, p: PrecSearchParams, page: number): Promise<{ total: number; items: PrecItem[] }> {
  const params: Record<string, string | number> = { display: PAGE_SIZE, page, sort: 'ddes' };
  if (p.query) params.query = p.query;
  if (p.search) params.search = p.search;
  if (src === 'prec' && p.jo) params.JO = p.jo;
  return cached(`s|${src}|${JSON.stringify(params)}`, async () => {
    const j = await call('lawSearch.do', src, params);
    const s = src === 'prec' ? j?.PrecSearch : j?.DetcSearch;
    if (!s) throw new PrecError(502, '법제처 판례 API 가 올바른 응답을 주지 않았습니다.');
    const raw = src === 'prec' ? s.prec : s.Detc;
    const rows: any[] = raw == null ? [] : Array.isArray(raw) ? raw : [raw];
    const items = src === 'prec'
      ? rows.map((r) => precItem(r, String(r.판례일련번호 ?? ''))).filter((it) => it.id)
      : rows.map((r) => detcItem(r, String(r.헌재결정례일련번호 ?? ''))).filter((it) => it.id !== 'c');
    return { total: parseInt(String(s.totalCnt ?? '0'), 10) || 0, items };
  });
}

/**
 * 목록. 출처가 하나면 그 출처의 쪽을 그대로, 둘이면 날짜 최신순으로 합쳐 준다.
 * 합친 n 쪽 = 출처마다 1~n 쪽을 읽어 섞은 것의 n 번째 토막 — 그래야 쪽을 넘겨도 순서가 어긋나지 않는다.
 */
export async function searchPrecedents(p: PrecSearchParams): Promise<PrecSearchResult> {
  if (p.sources.length === 1) {
    const src = p.sources[0];
    const r = await searchOne(src, p, p.page);
    return { total: r.total, counts: { [src]: r.total }, items: r.items, more: p.page * PAGE_SIZE < r.total && r.items.length > 0 };
  }
  const page = Math.min(p.page, MAX_MERGED_PAGE);
  const perSrc = await Promise.all(p.sources.map(async (src) => {
    const items: PrecItem[] = [];
    let total = 0;
    for (let n = 1; n <= page; n++) {
      const r = await searchOne(src, p, n);
      total = r.total;
      items.push(...r.items);
      if (!r.items.length || items.length >= total) break;
    }
    return { src, total, items };
  }));
  // 날짜가 같으면 출처 순서(판례 먼저)·받은 순서를 지킨다(sort 는 안정 정렬)
  const merged = perSrc.flatMap((s) => s.items).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const total = perSrc.reduce((n, s) => n + s.total, 0);
  const counts: Partial<Record<PrecSrc, number>> = {};
  for (const s of perSrc) counts[s.src] = s.total;
  const items = merged.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return { total, counts, items, more: page < MAX_MERGED_PAGE && page * PAGE_SIZE < total && items.length > 0 };
}

export function getPrecedent(id: string): Promise<PrecDetail> {
  const detc = id.startsWith('c');
  const seq = detc ? id.slice(1) : id;
  return cached(`d|${id}`, async () => {
    const j = await call('lawService.do', detc ? 'detc' : 'prec', { ID: seq });
    const d = detc ? j?.DetcService : j?.PrecService;
    if (!d) throw new PrecError(404, '이 판례는 본문이 제공되지 않습니다.');
    return detc
      ? {
        ...detcItem(d, String(d.헌재결정례일련번호 ?? seq)),
        holding: clean(d.판시사항),
        summary: clean(d.결정요지),
        target: clean(d.심판대상조문),
        refLaws: clean(d.참조조문),
        refCases: clean(d.참조판례),
        body: clean(d.전문),
      }
      : {
        ...precItem(d, String(d.판례정보일련번호 ?? seq)),
        holding: clean(d.판시사항),
        summary: clean(d.판결요지),
        target: '',
        refLaws: clean(d.참조조문),
        refCases: clean(d.참조판례),
        body: clean(d.판례내용),
      };
  });
}
