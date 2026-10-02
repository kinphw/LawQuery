import { pressQuery } from '../PressDb';

/**
 * 기관 보도자료 검색 — stn_press_db.press_document (1파일 = 1행, 게시물의 첨부 N개는 N행).
 *
 * FULLTEXT 가 없어 LIKE 로 찾는다(8만 행·본문 1GB 남짓). 그래서
 *  - 목록은 최신순 LIMIT 으로 끊어 먼저 주고(게시일 인덱스를 타면 흔한 낱말은 금방 찬다),
 *  - 건수는 따로(count) 느긋하게 센다 — 화면은 목록을 먼저 그리고 건수는 오면 채운다.
 * 미리보기는 본문 전체를 가져오지 않고 SQL 에서 검색어 둘레만 잘라 온다(docmine PressCorpusService 와 같은 방식).
 */
export const PRESS_SOURCES: Record<string, string> = {
  fsc: '금융위원회',
  fss: '금융감독원',
  moef: '기획재정부',
  bok: '한국은행',
};

export type PressIn = 'all' | 'title' | 'body';

export interface PressCriteria {
  tokens: string[];
  where: PressIn;
  sources: string[];
  from?: string;
  to?: string;
}

export interface PressRow {
  id: number;
  source: string;
  source_seq: string;
  folder: string;
  published_date: string | null;
  post_title: string | null;
  file_name: string;
  file_ext: string | null;
  file_url: string | null;
  char_count: number;
}

const SNIPPET_LEAD = 70;
const SNIPPET_LEN = 260;

/** LIKE 의 와일드카드(% _ \)를 글자 그대로 찾게. */
const likeOf = (tok: string) => `%${tok.replace(/[\\%_]/g, (c) => '\\' + c)}%`;

function buildWhere(c: PressCriteria, withSource = true): { sql: string; params: any[] } {
  const conds: string[] = [];
  const params: any[] = [];
  for (const tok of c.tokens) {
    const like = likeOf(tok);
    if (c.where === 'title') {
      conds.push('(post_title LIKE ? OR file_name LIKE ?)');
      params.push(like, like);
    } else if (c.where === 'body') {
      conds.push('content LIKE ?');
      params.push(like);
    } else {
      conds.push('(post_title LIKE ? OR file_name LIKE ? OR content LIKE ?)');
      params.push(like, like, like);
    }
  }
  if (withSource && c.sources.length) {
    conds.push(`source IN (${c.sources.map(() => '?').join(',')})`);
    params.push(...c.sources);
  }
  if (c.from) { conds.push('published_date >= ?'); params.push(c.from); }
  if (c.to) { conds.push('published_date <= ?'); params.push(c.to); }
  return { sql: conds.length ? ` WHERE ${conds.join(' AND ')}` : '', params };
}

export class PressModel {
  private statsCache: { at: number; data: any[] } | null = null;

  /** 기관별 보유 현황(문서·게시물 수, 기간). 10분 캐시. */
  async sources(): Promise<any[]> {
    if (this.statsCache && Date.now() - this.statsCache.at < 10 * 60 * 1000) return this.statsCache.data;
    const rows = await pressQuery<{ source: string; docs: number; posts: number; first: string; last: string }>(
      `SELECT source, COUNT(*) AS docs, COUNT(DISTINCT source_seq) AS posts,
              MIN(published_date) AS first, MAX(published_date) AS last
       FROM press_document GROUP BY source`,
    );
    const data = Object.keys(PRESS_SOURCES).map((code) => {
      const r = rows.find((x) => x.source === code);
      return { code, name: PRESS_SOURCES[code], docs: Number(r?.docs ?? 0), posts: Number(r?.posts ?? 0), first: r?.first ?? null, last: r?.last ?? null };
    });
    this.statsCache = { at: Date.now(), data };
    return data;
  }

  /**
   * 목록 한 쪽. size+1 건을 읽어 '더 있음'만 알린다(건수는 count 가 따로).
   * snippet 은 본문에서 처음 걸린 검색어 둘레(없으면 본문 첫머리), hit 는 본문에 검색어가 있었는지.
   */
  async search(c: PressCriteria, page: number, size: number) {
    const { sql: where, params } = buildWhere(c);
    // 미리보기 중심: 본문에 있는 첫 검색어. 본문에 하나도 없으면(제목만 일치) 0 → 첫머리.
    const posExpr = c.tokens.length
      ? `COALESCE(${c.tokens.map(() => 'NULLIF(LOCATE(?, content), 0)').join(', ')}, 0)`
      : '0';
    const posParams = c.tokens;
    const rows = await pressQuery<PressRow & { pos: number; snip: string | null }>(
      `SELECT id, source, source_seq, published_date, post_title, file_name, file_ext, char_count,
              ${posExpr} AS pos,
              SUBSTRING(content, GREATEST(1, ${posExpr} - ${SNIPPET_LEAD}), ${SNIPPET_LEN}) AS snip
       FROM press_document${where}
       ORDER BY published_date DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...posParams, ...posParams, ...params, size + 1, (page - 1) * size],
    );
    const more = rows.length > size;
    const items = rows.slice(0, size).map((r) => {
      const pos = Number(r.pos) || 0;
      return {
        id: r.id,
        source: r.source,
        postKey: `${r.source}:${r.source_seq}`,
        date: r.published_date,
        title: r.post_title || r.file_name,
        fileName: r.file_name,
        ext: (r.file_ext || '').toLowerCase(),
        chars: Number(r.char_count) || 0,
        hit: pos > 0,
        snippet: (r.snip || '').replace(/\s+/g, ' ').trim(),
        cut: pos > SNIPPET_LEAD + 1,
      };
    });
    return { items, more };
  }

  /** 조건에 맞는 건수 — 전체와 기관별(기관 조건을 뺀 채로 세어, 기관 단추에 숫자를 달 수 있게). */
  async count(c: PressCriteria) {
    const { sql: where, params } = buildWhere(c, false);
    const rows = await pressQuery<{ source: string; n: number }>(
      `SELECT source, COUNT(*) AS n FROM press_document${where} GROUP BY source`, params,
    );
    const bySource: Record<string, number> = {};
    for (const code of Object.keys(PRESS_SOURCES)) bySource[code] = 0;
    for (const r of rows) bySource[r.source] = Number(r.n);
    const picked = c.sources.length ? c.sources : Object.keys(PRESS_SOURCES);
    const total = picked.reduce((s, code) => s + (bySource[code] || 0), 0);
    return { total, bySource };
  }

  async row(id: number): Promise<PressRow | null> {
    const rows = await pressQuery<PressRow>(
      `SELECT id, source, source_seq, folder, published_date, post_title, file_name, file_ext, file_url, char_count
       FROM press_document WHERE id = ?`, [id],
    );
    return rows[0] ?? null;
  }

  async content(id: number): Promise<string> {
    const rows = await pressQuery<{ content: string | null }>('SELECT content FROM press_document WHERE id = ?', [id]);
    return rows[0]?.content ?? '';
  }

  /** 같은 게시물의 파일 전부(본문·별첨). 보도자료 본문이 앞에 오게. */
  async siblings(source: string, sourceSeq: string): Promise<PressRow[]> {
    const rows = await pressQuery<PressRow>(
      `SELECT id, source, source_seq, folder, published_date, post_title, file_name, file_ext, file_url, char_count
       FROM press_document WHERE source = ? AND source_seq = ? ORDER BY file_name`, [source, sourceSeq],
    );
    const rank = (n: string) => (/별첨|붙임|참고자료|첨부/.test(n) ? 1 : 0);
    return rows.sort((a, b) => rank(a.file_name) - rank(b.file_name));
  }
}
