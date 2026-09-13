/**
 * 로컬판 API — Express 라우터 자리에 "브라우저 안의 라우터"를 끼운다.
 *
 * 원리: 프론트의 모든 요청은 fetch('/api/...') 한 곳을 지난다. 그래서 window.fetch 를 가로채
 *   /api/* 만 브라우저 내부에서 처리하고 나머지는 원래 fetch 로 넘긴다.
 *   → 프론트 코드는 한 글자도 고치지 않는다(호스팅판과 완전히 같은 번들을 쓴다).
 *
 * 컨트롤러는 백엔드 것을 "그대로" 재사용한다. Express 의 req/res 중 컨트롤러가 실제로 쓰는 것은
 *   req.query · req.params · req.member · res.status().json() 뿐이라 그 모양만 흉내내면 된다.
 */
import { LawController } from '../backend/ts/law/controllers/LawController';
import { PenaltyController } from '../backend/ts/law/controllers/PenaltyController';
import { ReferenceController } from '../backend/ts/law/controllers/ReferenceController';
import { AnnexController } from '../backend/ts/law/controllers/AnnexController';
import { InterpretationController } from '../backend/ts/interpretation/controllers/InterpretationController';
import { LOCAL_MEMBER } from './authStub';

/** Express req 중 컨트롤러가 실제로 참조하는 부분만. */
interface LocalReq {
  query: Record<string, string | string[]>;
  params: Record<string, string>;
  body: any;
  member: typeof LOCAL_MEMBER;
}

/** Express res 흉내 — status()/json() 체인만 지원하고, 결과를 Promise 로 넘긴다. */
class LocalRes {
  private statusCode = 200;
  private settled = false;
  constructor(private readonly done: (status: number, body: unknown) => void) {}

  status(code: number): this {
    this.statusCode = code;
    return this;
  }

  json(body: unknown): void {
    if (this.settled) return;
    this.settled = true;
    this.done(this.statusCode, body);
  }

  send(body: unknown): void {
    this.json(body);
  }
}

type Handler = (req: LocalReq, res: LocalRes) => Promise<void> | void;

const law = new LawController();
const penalty = new PenaltyController();
const reference = new ReferenceController();
const annex = new AnnexController();
const interpretation = new InterpretationController();

/**
 * 라우트 표 — 호스팅판의 LawHandler/InterpretationHandler 와 같은 경로를 그대로 옮긴 것.
 * 로그인 게이트는 로컬판에 없다(전량 개방).
 */
const ROUTES: Record<string, Handler> = {
  // ── 법령 ──
  'GET /api/law/list': (q, r) => law.getLawList(q as any, r as any),
  'GET /api/law/getTitles': (q, r) => law.getTitles(q as any, r as any),
  'GET /api/law/article': (q, r) => law.getArticle(q as any, r as any),
  'GET /api/law/meta': (q, r) => law.getMeta(q as any, r as any),
  'GET /api/law/all': (q, r) => law.getAll(q as any, r as any),
  'GET /api/law/get': (q, r) => law.getByIds(q as any, r as any),
  'GET /api/law/pivot': (q, r) => law.getPivot(q as any, r as any),
  'GET /api/law/delegation': (q, r) => law.getDelegationChain(q as any, r as any),
  'GET /api/law/highlights': (q, r) => law.getHighlights(q as any, r as any),
  'GET /api/law/penaltyIds': (q, r) => penalty.getPenaltyIds(q as any, r as any),
  'GET /api/law/penalty': (q, r) => penalty.getPenalty(q as any, r as any),
  'GET /api/law/referenceIds': (q, r) => reference.getReferenceIds(q as any, r as any),
  'GET /api/law/reference': (q, r) => reference.getReference(q as any, r as any),
  'GET /api/law/annexIds': (q, r) => annex.getAnnexIds(q as any, r as any),
  'GET /api/law/annex': (q, r) => annex.getAnnex(q as any, r as any),

  // ── 유권해석 ──
  'GET /api/interpretation/initial': (q, r) => interpretation.getInitialData(q as any, r as any),
  'GET /api/interpretation/search': (q, r) => interpretation.search(q as any, r as any),

  // ── 인증 자리 — 로컬판은 항상 전체 개방 ──
  'GET /api/auth/me': (_q, r) => {
    r.status(200).json({
      authenticated: true,
      status: 'approved',
      role: LOCAL_MEMBER.role,
      displayName: LOCAL_MEMBER.name,
      loginId: LOCAL_MEMBER.email,
      source: 'local',
      remember: true,
    });
  },
  'GET /api/auth/banner': (_q, r) => r.status(200).json({ enabled: false }),
  'POST /api/auth/visit': (_q, r) => r.status(200).json({ success: true }),
  'POST /api/auth/logout': (_q, r) => r.status(200).json({ success: true }),
  'POST /api/auth/remember': (_q, r) => r.status(200).json({ success: true }),

  // ── 즐겨찾기 — 서버가 없으므로 브라우저 저장소로 대체(아래 favorite* 함수) ──
  'GET /api/favorite': (q, r) => r.status(200).json({ success: true, data: favoriteList(q) }),
  'POST /api/favorite': (q, r) => r.status(200).json({ success: true, data: favoriteToggle(q) }),
  'DELETE /api/favorite': (q, r) => r.status(200).json({ success: true, data: favoriteRemove(q) }),
};

/** 파라미터가 있는 경로(패턴 → 핸들러). 지금은 유권해석 상세 하나뿐. */
const PATTERNS: Array<{ method: string; regex: RegExp; keys: string[]; handler: Handler }> = [
  {
    method: 'GET',
    regex: /^\/api\/interpretation\/detail\/([^/]+)$/,
    keys: ['id'],
    handler: (q, r) => interpretation.getDetail(q as any, r as any),
  },
];

// ────────────────────────────── 즐겨찾기(로컬 저장) ──────────────────────────────
// 호스팅판은 ldb_auth.favorite 에 회원별로 저장하지만, 로컬판은 서버가 없다.
// 폐쇄망 사용자에게도 쓸모가 큰 기능이라 localStorage 로 살려 둔다(그 PC 안에서만 유효).
const FAV_KEY = 'lq_local_favorite';

function favoriteAll(): Array<Record<string, string>> {
  try {
    return JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
  } catch {
    return [];
  }
}

function favoriteSave(rows: Array<Record<string, string>>): void {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(rows));
  } catch {
    /* 저장 실패(사생활 보호 모드 등)는 무시 — 기능만 비활성 */
  }
}

function favKey(q: LocalReq): string {
  const g = (k: string) => String((q.query[k] ?? q.body?.[k] ?? '') || '');
  return [g('scope'), g('code') || g('law'), g('article') || g('id')].join('|');
}

function favoriteList(q: LocalReq): Array<Record<string, string>> {
  const scope = String(q.query.scope || '');
  const rows = favoriteAll();
  return scope ? rows.filter((r) => r.scope === scope) : rows;
}

function favoriteToggle(q: LocalReq): Array<Record<string, string>> {
  const key = favKey(q);
  const rows = favoriteAll();
  if (!rows.some((r) => r._key === key)) {
    rows.push({
      _key: key,
      scope: String(q.query.scope || q.body?.scope || ''),
      code: String(q.query.code || q.body?.code || q.query.law || ''),
      article: String(q.query.article || q.body?.article || q.query.id || ''),
      created_at: new Date().toISOString(),
    });
    favoriteSave(rows);
  }
  return rows;
}

function favoriteRemove(q: LocalReq): Array<Record<string, string>> {
  const key = favKey(q);
  const rows = favoriteAll().filter((r) => r._key !== key);
  favoriteSave(rows);
  return rows;
}

// ────────────────────────────── 요청 처리 ──────────────────────────────

function parseQuery(sp: URLSearchParams): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(sp.keys())) {
    const all = sp.getAll(key);
    // Express 와 동일: 같은 키가 여러 번이면 배열, 한 번이면 문자열.
    out[key] = all.length > 1 ? all : all[0];
  }
  return out;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function handleApi(method: string, url: URL, init?: RequestInit): Promise<Response> {
  let body: any = undefined;
  if (init?.body && typeof init.body === 'string') {
    try {
      body = JSON.parse(init.body);
    } catch {
      body = init.body;
    }
  }

  const req: LocalReq = {
    query: parseQuery(url.searchParams),
    params: {},
    body,
    member: LOCAL_MEMBER, // 로컬판은 언제나 pro
  };

  let handler = ROUTES[`${method} ${url.pathname}`];
  if (!handler) {
    for (const p of PATTERNS) {
      if (p.method !== method) continue;
      const m = url.pathname.match(p.regex);
      if (m) {
        p.keys.forEach((k, i) => (req.params[k] = decodeURIComponent(m[i + 1])));
        handler = p.handler;
        break;
      }
    }
  }

  if (!handler) {
    console.warn('[로컬판] 지원하지 않는 API:', method, url.pathname);
    return jsonResponse(404, {
      success: false,
      error: '로컬판에서는 제공하지 않는 기능입니다.',
      local: true,
    });
  }

  return new Promise<Response>((resolve) => {
    const res = new LocalRes((status, payload) => resolve(jsonResponse(status, payload)));
    Promise.resolve(handler!(req, res)).catch((err) => {
      console.error('[로컬판] API 오류:', url.pathname, err);
      resolve(jsonResponse(500, {
        success: false,
        error: err instanceof Error ? err.message : '로컬 처리 중 오류가 발생했습니다.',
      }));
    });
  });
}

/**
 * fetch 가로채기 설치. 번들보다 먼저 실행되어야 한다(entry 최상단).
 * 이미 설치돼 있으면 아무것도 하지 않는다.
 */
export function installLocalApi(): void {
  const w = window as any;
  if (w.__lqLocalApiInstalled) return;
  w.__lqLocalApiInstalled = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const raw =
      typeof input === 'string' ? input
        : input instanceof URL ? input.toString()
          : (input as Request).url;

    // 상대경로도 있으므로 현재 문서 기준으로 절대화한다.
    const url = new URL(raw, location.href);
    if (!url.pathname.includes('/api/')) return originalFetch(input as any, init);

    // /api 가 경로 중간에 올 수도 있으므로(하위 디렉토리 배포) 접두어를 잘라 정규화한다.
    const idx = url.pathname.indexOf('/api/');
    const normalized = new URL(url.toString());
    normalized.pathname = url.pathname.slice(idx);

    const method = (init?.method || (input as Request)?.method || 'GET').toUpperCase();
    return handleApi(method, normalized, init);
  };
}
