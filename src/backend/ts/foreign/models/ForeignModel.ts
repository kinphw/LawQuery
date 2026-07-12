import { createHash } from 'crypto';
import DbContext from '../../common/DbContext';

/**
 * 해외법령 데이터 모델 (seg-level).
 *  - 본문은 sentinel 소유 fin_law_db(law / law_provision)를 단일 소스로 읽는다.
 *    STN 이 article 내부를 개행(항목/문단) 단위 seg 로 적재(1 row = 1 seg).
 *  - 개인 메모는 회원 DB(ldb_auth.foreign_memo)에서 (law_code, article_no, seg_index) 논리키로 관리.
 *
 * 조회는 seg 별 행을 그대로 반환(GROUP_CONCAT 안 함). article_no 그룹·렌더는 프론트가 담당.
 * seg_index = article 내 1-based 순위(ROW_NUMBER PARTITION BY article_no ORDER BY ordinal) = 안정 앵커.
 */
const FIN_DB = 'fin_law_db';
const AUTH_DB = process.env.AUTH_DB || 'ldb_auth';

export interface ForeignLawListItem {
  code: string;
  jurisdiction: string;
  title_ko: string;
  title_original: string;
  abbrev: string | null;
  status: string;
  law_type: string;
  is_crypto: number;
  provision_count: number;
  ko_count: number; // 번역이 채워진 seg 수(0이면 원문만)
  // foreign_catalog(LQ 큐레이션) — 카드 설명/태그/하이라이트
  summary: string | null;
  tags: string[] | null;
  highlights: string[] | null;
  sort_order: number;
  hidden: number;
}

export interface ForeignLawMeta {
  id: number;
  code: string;
  jurisdiction: string;
  title_original: string;
  title_ko: string;
  abbrev: string | null;
  status: string;
  law_type: string;
  is_crypto: number;
  official_citation: string | null;
  source_url: string | null;
  translation_source: string;
  summary: string | null;      // foreign_catalog(LQ)
  highlights: string[] | null; // foreign_catalog(LQ)
}

export interface ForeignProvision {
  provision_id: number;       // 물리 law_provision.id (UPSERT로 안정, 잠정 참고용)
  part_no: string | null;     // 편/장 (TITLE/CHAPTER)
  article_no: string;         // 조/ANNEX 묶음 키
  seg_index: number;          // article 내 1-based 순위 = 안정 앵커(메모 키)
  para_no: string | null;     // 법적 마커('1','(a)','(i)') — 표시 전용(article 내 비유일)
  heading: string | null;     // 조 제목 — 각 조 첫 seg에만
  heading_ko: string | null;  // 조 제목 한국어(목차용) — 첫 seg에만
  seg_kind: string;           // 'article'(첫 seg)/'paragraph'/'item'/'other'(표)
  depth: number;              // 계층 깊이(0=섹션 … subsection/paragraph/subparagraph/clause) — 프론트 들여쓰기용
  text_original: string | null;
  text_ko: string | null;
  // 관리자 전용 주석 — 교정 오버레이의 앵커 검증 결과(재적재 드리프트). 공개 사용자에겐 미설정.
  //   stale  = 원문이 바뀌어 교정이 억제됨(재확인 필요) / legacy = 지문 없는 구버전 교정(미검증)
  review?: Array<{ field: string; kind: 'stale' | 'legacy'; prev?: string }>;
  // 관리자 전용 — 현재 베이스 위에 '적용 중'인 교정 필드 목록(수정됨 표시·X 되돌리기용).
  //   상류(원본)가 이 필드에서 바뀌어도 교정이 가리고 있음을 관리자가 보고 취소할 수 있게.
  overridden?: string[];
}

/** 교정 오버레이 셀 1개 — 값 + 편집 당시 원문 지문(레거시는 null). */
export interface OverrideCell { value: string; anchor_hash: string | null; }
/** 베이스 seg 지문 인덱스 — 위치별 지문 + 조 안 지문→위치 역인덱스(자가 치유용). */
export interface AnchorIndex {
  hashAt: Map<string, string>;                 // "<article_no>|<seg_index>" → 현재 base 지문
  artHash: Map<string, Map<string, number[]>>; // article_no → (지문 → seg_index[])
}

// ── 일본법 하위규정 연계(foreign_link, 자동 추출) ──────────────────────────────
/** 연계 상대 조문 1건(표시용). code+article 로 foreign.html 앵커 이동. */
export interface ForeignLinkRef {
  code: string;               // 상대 법령 code (dst 또는 src)
  title_ko: string;           // 상대 법령명(칩 표시)
  abbrev: string | null;      // 약칭(있으면 칩에 우선)
  article: string;            // 상대 조 번호(article_no)
  para: string | null;        // 항(項) 힌트 — 인용(outgoing)에만
  kind: string;               // 'delegates'(위임시행) | 'reference'(일반참조)
}
/** 한 조(article)의 양방향 연계. */
export interface ForeignArticleLinks {
  refs: ForeignLinkRef[];     // 이 조 → 상대 조 (이 조가 인용)
  citedBy: ForeignLinkRef[];  // 상대 조 → 이 조 (이 조를 인용/시행)
}

// ── 일본법 3단 연계표(법→시행령→부령) — 국내 5단 연계표의 일본판 ──────────────────
/** 연계표 한 조 안의 항/호 seg 1개(원문·국문 쌍). 국내 연계표처럼 항 단위로 렌더·강조. */
export interface LinkTableSeg { para: string | null; kind: string; original: string; ko: string; }
/** 연계표 한 조의 내용(조번호·제목 + 항 seg 배열). */
export interface LinkTableArticle {
  article: string;
  heading: string | null;
  heading_ko: string | null;
  segs: LinkTableSeg[];
}
/** 법 조 기준 밴드 — 그 법 조를 인용/시행하는 시행령·부령 조 번호 목록 + 인용된 법 항(강조용). */
export interface LinkTableBand { law: string; enf: string[]; sub: string[]; lawParas: string[]; }
export interface LinkTableData {
  family: string;
  rel: 'deleg' | 'all';                                       // 위임만 / 전체참조
  tiers: {
    law: { code: string; title: string };
    enf: { code: string; title: string };
    sub: { code: string; title: string };
  };
  content: Record<string, Record<string, LinkTableArticle>>; // code → article_no → 내용
  bands: LinkTableBand[];                                     // 법 조 번호 순
}

/** 일본 결제법 계열(법·시행령·부령) — 부령 트랙별. sub 만 다름. */
const JP_FAMILIES: Record<string, { law: string; enf: string; sub: string }> = {
  jp_epi:   { law: 'jp_psa', enf: 'jp_psa_enf', sub: 'jp_epi_co' },
  jp_funds: { law: 'jp_psa', enf: 'jp_psa_enf', sub: 'jp_funds_transfer_co' },
};

export class ForeignModel {
  private fin(): DbContext { return DbContext.getInstance(FIN_DB); }
  private auth(): DbContext { return DbContext.getInstance(AUTH_DB); }

  // MariaDB JSON 컬럼은 LONGTEXT alias 라 mysql2 가 문자열로 반환 → 배열로 파싱.
  private parseArr(v: any): string[] | null {
    if (v == null) return null;
    if (Array.isArray(v)) return v;
    try { const a = JSON.parse(v); return Array.isArray(a) ? a : null; } catch { return null; }
  }

  // ── 앵커 지문(anchor_hash) — 교정·메모를 '위치'가 아니라 '원문 정체성'에 붙인다 ─────────
  //   재적재가 seg 를 분리/재정렬해도, 저장된 지문으로 같은 조 안에서 원래 seg 를 다시 찾는다.
  /** seg 의 원문 정체성 지문. 공백만 정규화(사소한 재포맷엔 둔감, 내용 변화엔 민감). */
  static anchorHash(textOriginal: string | null, heading: string | null = null): string {
    const src = (textOriginal && textOriginal.trim()) ? textOriginal : (heading || '');
    const norm = String(src).replace(/\s+/g, ' ').trim();
    return createHash('sha256').update(norm, 'utf8').digest('hex');
  }

  /** base seg 행들로 지문 인덱스 구성(getProvisions·메모·reanchor 공용). */
  static buildAnchorIndex(
    rows: Array<{ article_no: string; seg_index: number; text_original: string | null; heading: string | null }>
  ): AnchorIndex {
    const hashAt = new Map<string, string>();
    const artHash = new Map<string, Map<string, number[]>>();
    for (const r of rows) {
      const h = ForeignModel.anchorHash(r.text_original, r.heading);
      hashAt.set(`${r.article_no}|${r.seg_index}`, h);
      let m = artHash.get(r.article_no);
      if (!m) artHash.set(r.article_no, m = new Map());
      let a = m.get(h);
      if (!a) m.set(h, a = []);
      a.push(r.seg_index);
    }
    return { hashAt, artHash };
  }

  /**
   * 교정/메모를 적용할 seg_index 를 해석. null 이면 억제(원문 드리프트).
   *   · anchorHash 없음(레거시) → 저장 위치 그대로(존재는 호출측이 확인)
   *   · 같은 조에 지문 일치 seg 유일 → 그 위치(순서 이동 자가 치유)
   *   · 일치 다수(모호) → 저장 위치의 지문이 맞으면 그 위치, 아니면 억제
   *   · 일치 없음 → 억제(내용 분리/변경)
   */
  static resolveAnchor(articleNo: string, storedIdx: number, anchorHash: string | null, idx: AnchorIndex): number | null {
    if (anchorHash == null) return storedIdx;
    const cands = idx.artHash.get(articleNo)?.get(anchorHash) || [];
    if (cands.length === 1) return cands[0];
    if (cands.length > 1) return idx.hashAt.get(`${articleNo}|${storedIdx}`) === anchorHash ? storedIdx : null;
    return null;
  }

  /** 드롭다운용 법령 목록(관할별 정렬, 번역 보유 seg 수 포함). */
  async listLaws(): Promise<ForeignLawListItem[]> {
    // law(sentinel 원문 메타, 폴백) ⊕ foreign_catalog(LQ 큐레이션, 우선). hidden 제외.
    const rows = await this.fin().query<any>(
      `SELECT l.code,
              COALESCE(c.jurisdiction, l.jurisdiction) AS jurisdiction,
              COALESCE(c.title_ko, l.title_ko)         AS title_ko,
              l.title_original,
              COALESCE(c.abbrev, l.abbrev)             AS abbrev,
              COALESCE(c.status, l.status)             AS status,
              COALESCE(c.law_type, l.law_type)         AS law_type,
              COALESCE(c.is_crypto, l.is_crypto)       AS is_crypto,
              l.provision_count,
              CAST(SUM(p.text_ko IS NOT NULL AND p.text_ko <> '') AS UNSIGNED) AS ko_count,
              c.summary, c.tags, c.highlights,
              COALESCE(c.sort_order, 100) AS sort_order,
              COALESCE(c.hidden, 0)       AS hidden
         FROM law l
         LEFT JOIN ${AUTH_DB}.foreign_catalog c ON c.code = l.code
         LEFT JOIN law_provision p ON p.law_id = l.id
        WHERE COALESCE(c.hidden, 0) = 0
        GROUP BY l.id
        ORDER BY FIELD(COALESCE(c.jurisdiction, l.jurisdiction), 'eu', 'us', 'jp', 'hk', 'sg', 'other'),
                 COALESCE(c.sort_order, 100), l.code`
    );
    return rows.map((r: any) => ({ ...r, tags: this.parseArr(r.tags), highlights: this.parseArr(r.highlights) })) as ForeignLawListItem[];
  }

  /** 단일 법령 메타. */
  async getLawMeta(code: string): Promise<ForeignLawMeta | null> {
    const rows = await this.fin().query<ForeignLawMeta>(
      `SELECT l.id, l.code,
              COALESCE(c.jurisdiction, l.jurisdiction) AS jurisdiction,
              l.title_original,
              COALESCE(c.title_ko, l.title_ko)   AS title_ko,
              COALESCE(c.abbrev, l.abbrev)        AS abbrev,
              COALESCE(c.status, l.status)        AS status,
              COALESCE(c.law_type, l.law_type)    AS law_type,
              COALESCE(c.is_crypto, l.is_crypto)  AS is_crypto,
              l.official_citation, l.source_url, l.translation_source,
              c.summary, c.highlights
         FROM law l
         LEFT JOIN ${AUTH_DB}.foreign_catalog c ON c.code = l.code
        WHERE l.code = ? LIMIT 1`,
      [code]
    );
    const r: any = rows[0];
    if (!r) return null;
    r.highlights = this.parseArr(r.highlights);
    return r as ForeignLawMeta;
  }

  /** seg 별 행(ordinal 순). article_no 그룹·seg 정렬은 프론트가 처리. */
  async getProvisions(code: string): Promise<ForeignProvision[]> {
    return this.fin().query<ForeignProvision>(
      `SELECT p.id AS provision_id, p.part_no, p.article_no, p.para_no, p.heading, p.heading_ko, p.seg_kind, p.depth,
              p.text_original, p.text_ko,
              ROW_NUMBER() OVER (PARTITION BY p.article_no ORDER BY p.ordinal) AS seg_index
         FROM law_provision p
         JOIN law l ON l.id = p.law_id
        WHERE l.code = ? AND p.article_no IS NOT NULL
        ORDER BY p.ordinal`,
      [code]
    );
  }

  // ── 일본법 하위규정 연계(foreign_link) — 자동 추출 엣지, 양방향 조회 ──────────────
  //    src(하위)→dst(모법) 방향으로만 저장. 이 법(code)을 볼 때:
  //      refs    = src_code=code (이 조가 인용하는 상대 조)
  //      citedBy = dst_code=code (이 조를 인용/시행하는 상대 조 — 저장 엣지의 반전)
  //    반환: { "<이 법의 article_no>": { refs:[…], citedBy:[…] } }. 비 일본법은 빈 맵.
  async getLinks(code: string): Promise<Record<string, ForeignArticleLinks>> {
    const map: Record<string, ForeignArticleLinks> = {};
    const slot = (art: string): ForeignArticleLinks =>
      (map[art] ||= { refs: [], citedBy: [] });

    // outgoing: 이 법의 각 조가 인용하는 상대 조.
    const out = await this.fin().query<any>(
      `SELECT fl.src_article AS from_article, fl.dst_code AS code, fl.dst_article AS article,
              fl.dst_para AS para, fl.rel_kind AS kind, l.title_ko, l.abbrev
         FROM foreign_link fl JOIN law l ON l.code = fl.dst_code
        WHERE fl.src_code = ?
        ORDER BY CAST(fl.src_article AS UNSIGNED), fl.src_article,
                 fl.dst_code, CAST(fl.dst_article AS UNSIGNED), fl.dst_article`,
      [code]
    );
    for (const r of out) {
      const arr = slot(r.from_article).refs;
      this.mergeRef(arr, { code: r.code, title_ko: r.title_ko, abbrev: r.abbrev, article: r.article, para: r.para, kind: r.kind });
    }

    // incoming: 이 법의 각 조를 인용/시행하는 상대 조(저장 엣지 반전).
    const inc = await this.fin().query<any>(
      `SELECT fl.dst_article AS to_article, fl.src_code AS code, fl.src_article AS article,
              fl.rel_kind AS kind, l.title_ko, l.abbrev
         FROM foreign_link fl JOIN law l ON l.code = fl.src_code
        WHERE fl.dst_code = ?
        ORDER BY CAST(fl.dst_article AS UNSIGNED), fl.dst_article,
                 fl.src_code, CAST(fl.src_article AS UNSIGNED), fl.src_article`,
      [code]
    );
    for (const r of inc) {
      const arr = slot(r.to_article).citedBy;
      this.mergeRef(arr, { code: r.code, title_ko: r.title_ko, abbrev: r.abbrev, article: r.article, para: null, kind: r.kind });
    }
    return map;
  }

  /** (code, article) 단위로 칩 1개로 병합 — delegates 가 reference 를 이긴다. */
  private mergeRef(arr: ForeignLinkRef[], ref: ForeignLinkRef): void {
    const hit = arr.find(x => x.code === ref.code && x.article === ref.article);
    if (!hit) { arr.push(ref); return; }
    if (ref.kind === 'delegates') hit.kind = 'delegates';
    if (!hit.para && ref.para) hit.para = ref.para;
  }

  // ── 3단 연계표(법→시행령→부령) — 국내 5단 연계표의 일본판 ──────────────────────────
  /** 조번호 자연정렬 키: '2'→2000, '2의2'→2002, '62의3'→62003. */
  private artKey(a: string): number {
    const m = String(a).match(/^(\d+)(?:의(\d+))?/);
    return m ? parseInt(m[1]) * 1000 + (m[2] ? parseInt(m[2]) : 0) : 0;
  }

  /**
   * 결제법 계열 3단(법·시행령·부령[트랙]) 연계표 데이터.
   *   bands = foreign_link 에서 '법(dst)을 인용/시행하는 시행령·부령(src) 조'를 법 조별로 묶음.
   *   content = 각 법의 조번호→내용(원문/국문은 조 내 seg 개행결합). 밴드에 등장하는 조만 담아 경량화.
   *   비존재 family 는 null.
   */
  async getLinkTable(family: string, rel: 'deleg' | 'all' = 'deleg'): Promise<LinkTableData | null> {
    const fam = JP_FAMILIES[family];
    if (!fam) return null;

    // 1. 밴드: 법 조(dst) 기준으로 시행령·부령(src) 조 + 인용된 법 항(dst_para) 수집.
    //    기본(deleg)=위임(…に規定する…で定める)만 → 국내 연계표처럼 위임체인만. all=단순참조 포함.
    const kindFilter = rel === 'deleg' ? ` AND rel_kind = 'delegates'` : '';
    const edges = await this.fin().query<any>(
      `SELECT DISTINCT src_code, src_article, dst_article, dst_para
         FROM foreign_link WHERE dst_code = ? AND src_code IN (?, ?)${kindFilter}`,
      [fam.law, fam.enf, fam.sub]
    );
    const bandMap = new Map<string, { enf: Set<string>; sub: Set<string>; paras: Set<string> }>();
    for (const e of edges) {
      let b = bandMap.get(e.dst_article);
      if (!b) { b = { enf: new Set(), sub: new Set(), paras: new Set() }; bandMap.set(e.dst_article, b); }
      if (e.src_code === fam.enf) b.enf.add(e.src_article);
      else if (e.src_code === fam.sub) b.sub.add(e.src_article);
      if (e.dst_para) b.paras.add(String(e.dst_para));
    }
    const cmp = (x: string, y: string) => this.artKey(x) - this.artKey(y);

    // 1단(법)은 앵커이므로 **전체 조를 문서순으로** 밴드에 넣는다(위임 없는 조는 시행령·부령 칸이 빔).
    // 고아(어느 법 조에도 안 걸리는 시행령·부령 조)만 자연히 누락된다.
    const lawArtRows = await this.fin().query<any>(
      `SELECT p.article_no, MIN(p.ordinal) AS o
         FROM law_provision p JOIN law l ON l.id = p.law_id
        WHERE l.code = ? AND p.article_no IS NOT NULL
        GROUP BY p.article_no ORDER BY o`, [fam.law]
    );
    const bands: LinkTableBand[] = lawArtRows.map((r: any) => {
      const b = bandMap.get(r.article_no);
      return b
        ? { law: r.article_no, enf: [...b.enf].sort(cmp), sub: [...b.sub].sort(cmp), lawParas: [...b.paras] }
        : { law: r.article_no, enf: [], sub: [], lawParas: [] };
    });

    // 담아야 할 조: 법=전체(밴드 전부), 시행령·부령=엣지 등장분만(경량화).
    const need: Record<string, Set<string>> = { [fam.law]: new Set(), [fam.enf]: new Set(), [fam.sub]: new Set() };
    for (const b of bands) {
      need[fam.law].add(b.law);
      b.enf.forEach(a => need[fam.enf].add(a));
      b.sub.forEach(a => need[fam.sub].add(a));
    }

    // 2. 내용 + 제목.
    const content: Record<string, Record<string, LinkTableArticle>> = {};
    const tiers: any = {};
    const keyMap: Record<string, 'law' | 'enf' | 'sub'> = { [fam.law]: 'law', [fam.enf]: 'enf', [fam.sub]: 'sub' };
    for (const code of [fam.law, fam.enf, fam.sub]) {
      const meta = await this.fin().query<any>(`SELECT title_ko, abbrev FROM law WHERE code=? LIMIT 1`, [code]);
      tiers[keyMap[code]] = { code, title: (meta[0]?.abbrev || meta[0]?.title_ko || code) };
      const rows = await this.fin().query<any>(
        `SELECT p.article_no, p.para_no, p.seg_kind, p.heading, p.heading_ko, p.text_original, p.text_ko
           FROM law_provision p JOIN law l ON l.id = p.law_id
          WHERE l.code = ? AND p.article_no IS NOT NULL
          ORDER BY p.ordinal`, [code]
      );
      const byArt: Record<string, LinkTableArticle> = {};
      for (const r of rows) {
        if (!need[code].has(r.article_no)) continue;
        let a = byArt[r.article_no];
        if (!a) a = byArt[r.article_no] = { article: r.article_no, heading: r.heading, heading_ko: r.heading_ko, segs: [] };
        a.segs.push({ para: r.para_no, kind: r.seg_kind, original: r.text_original || '', ko: r.text_ko || '' });
      }
      content[code] = byArt;
    }
    return { family, rel, tiers, content, bands };
  }

  // ── 본문 교정 레이어(ldb_auth.foreign_override) — 운영에서도 안전한 오탈자 교정 ──
  //    원본(fin_law_db.law_provision)은 STN·번역스크립트 관리 베이스로 불변. 사람 교정은 여기에.
  //    조회 시 베이스 위에 덮어 보여준다(getProvisions). 이관은 fin_law_db만 건드려 교정 무영향.
  /** 교정 가능 컬럼 화이트리스트. 구조 키(article_no/part_no/seg_kind)는 제외(논리키·목차 앵커 보호). */
  static readonly EDITABLE_FIELDS = ['text_original', 'text_ko', 'heading', 'heading_ko'] as const;

  /** 법령 전체 교정 맵 { "<article_no>|<seg_index>|<field>": { value, anchor_hash } }. */
  async getOverrides(code: string): Promise<Record<string, OverrideCell>> {
    const rows = await this.auth().query<{ article_no: string; seg_index: number; field: string; value: string; anchor_hash: string | null }>(
      `SELECT article_no, seg_index, field, value, anchor_hash FROM foreign_override WHERE law_code = ?`,
      [code]
    );
    const map: Record<string, OverrideCell> = {};
    rows.forEach(r => { map[`${r.article_no}|${r.seg_index}|${r.field}`] = { value: r.value, anchor_hash: r.anchor_hash }; });
    return map;
  }

  async upsertOverride(code: string, articleNo: string, segIndex: number, field: string, value: string, anchorHash: string): Promise<void> {
    await this.auth().query(
      `INSERT INTO foreign_override (law_code, article_no, seg_index, field, value, anchor_hash)
            VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value), anchor_hash = VALUES(anchor_hash)`,
      [code, articleNo, segIndex, field, value, anchorHash]
    );
  }

  /** 쓰기 시점 그 seg 의 현재 base 원문 지문(교정/메모 저장 앵커). */
  async getBaseAnchor(code: string, articleNo: string, segIndex: number): Promise<string> {
    const rows = await this.fin().query<{ text_original: string | null; heading: string | null }>(
      `SELECT t.text_original, t.heading FROM (
         SELECT p.text_original, p.heading,
                ROW_NUMBER() OVER (PARTITION BY p.article_no ORDER BY p.ordinal) AS seg_index
           FROM law_provision p JOIN law l ON l.id = p.law_id
          WHERE l.code = ? AND p.article_no = ?
       ) t WHERE t.seg_index = ?`,
      [code, articleNo, segIndex]
    );
    return ForeignModel.anchorHash(rows[0]?.text_original ?? null, rows[0]?.heading ?? null);
  }

  /** 지문 인덱스용 base seg 행(article_no, seg_index, text_original, heading). getProvisions 와 동일 키. */
  async getBaseSegRows(code: string): Promise<Array<{ article_no: string; seg_index: number; text_original: string | null; heading: string | null }>> {
    return this.fin().query(
      `SELECT p.article_no, p.text_original, p.heading,
              ROW_NUMBER() OVER (PARTITION BY p.article_no ORDER BY p.ordinal) AS seg_index
         FROM law_provision p JOIN law l ON l.id = p.law_id
        WHERE l.code = ? AND p.article_no IS NOT NULL
        ORDER BY p.ordinal`,
      [code]
    );
  }

  async deleteOverride(code: string, articleNo: string, segIndex: number, field: string): Promise<void> {
    await this.auth().query(
      `DELETE FROM foreign_override WHERE law_code = ? AND article_no = ? AND seg_index = ? AND field = ?`,
      [code, articleNo, segIndex, field]
    );
  }

  /** 교정 삭제(원본 복귀) 시 프론트가 표시할 베이스 값. field 는 화이트리스트 검증 후만 전달(인터폴레이션 안전). */
  async getBaseField(code: string, articleNo: string, segIndex: number, field: string): Promise<string | null> {
    const rows = await this.fin().query<{ val: string | null }>(
      `SELECT t.val FROM (
         SELECT p.${field} AS val,
                ROW_NUMBER() OVER (PARTITION BY p.article_no ORDER BY p.ordinal) AS seg_index
           FROM law_provision p JOIN law l ON l.id = p.law_id
          WHERE l.code = ? AND p.article_no = ?
       ) t WHERE t.seg_index = ?`,
      [code, articleNo, segIndex]
    );
    return rows[0] ? rows[0].val : null;
  }

  // ── 메모(ldb_auth.foreign_memo) — 운영자 큐레이션(전역). 논리키 (law_code, article_no, seg_index) ─
  //    작성=운영자(adminGuard), 열람=전체 공개. 더는 회원별이 아니라 법조문(seg)별 1건.
  /** { "<article_no>|<seg_index>": { memo, anchor_hash } } 맵 (전역). 앵커 검증은 컨트롤러가 수행. */
  async getMemos(code: string): Promise<Record<string, { memo: string; anchor_hash: string | null }>> {
    const rows = await this.auth().query<{ article_no: string; seg_index: number; memo: string; anchor_hash: string | null }>(
      `SELECT article_no, seg_index, memo, anchor_hash FROM foreign_memo WHERE law_code = ?`,
      [code]
    );
    const map: Record<string, { memo: string; anchor_hash: string | null }> = {};
    rows.forEach(r => { map[`${r.article_no}|${r.seg_index}`] = { memo: r.memo, anchor_hash: r.anchor_hash }; });
    return map;
  }

  async upsertMemo(code: string, articleNo: string, segIndex: number, memo: string, anchorHash: string): Promise<void> {
    await this.auth().query(
      `INSERT INTO foreign_memo (law_code, article_no, seg_index, memo, anchor_hash)
            VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE memo = VALUES(memo), anchor_hash = VALUES(anchor_hash)`,
      [code, articleNo, segIndex, memo, anchorHash]
    );
  }

  async deleteMemo(code: string, articleNo: string, segIndex: number): Promise<void> {
    await this.auth().query(
      `DELETE FROM foreign_memo WHERE law_code = ? AND article_no = ? AND seg_index = ?`,
      [code, articleNo, segIndex]
    );
  }

  // ── 재정착(reanchor) — 재적재 후 seg_index 를 지문으로 다시 붙인다(선택적 하우스키핑) ──────
  //   조회는 이미 지문으로 자가 치유되지만, 저장된 seg_index 를 실제 위치로 갱신해 두면
  //   이후 조회가 가벼워지고 '고아(orphan)' 교정(원문이 분리/삭제돼 못 찾는 것) 리포트를 얻는다.
  //   지문 없는 레거시 행은 대상 외(자동 이동 불가 — 관리자가 재저장해 지문을 채워야 함).
  private async reanchorTable(
    table: 'foreign_override' | 'foreign_memo', code: string, idx: AnchorIndex
  ): Promise<{ relocated: number; orphaned: Array<{ article_no: string; seg_index: number; field?: string }> }> {
    const hasField = table === 'foreign_override';
    const rows = await this.auth().query<{ id: number; article_no: string; seg_index: number; field?: string; anchor_hash: string }>(
      `SELECT id, article_no, seg_index${hasField ? ', field' : ''}, anchor_hash
         FROM ${table} WHERE law_code = ? AND anchor_hash IS NOT NULL`,
      [code]
    );
    let relocated = 0;
    const orphaned: Array<{ article_no: string; seg_index: number; field?: string }> = [];
    for (const r of rows) {
      if (idx.hashAt.get(`${r.article_no}|${r.seg_index}`) === r.anchor_hash) continue; // 이미 정합
      const cands = idx.artHash.get(r.article_no)?.get(r.anchor_hash) || [];
      if (cands.length === 1 && cands[0] !== r.seg_index) {
        try {
          await this.auth().query(`UPDATE ${table} SET seg_index = ? WHERE id = ?`, [cands[0], r.id]);
          relocated++;
        } catch {
          // 대상 위치에 같은 (조,seg,field) 행이 이미 있음(유니크 충돌) → 고아로 리포트.
          orphaned.push({ article_no: r.article_no, seg_index: r.seg_index, field: r.field });
        }
      } else if (cands.length === 0) {
        orphaned.push({ article_no: r.article_no, seg_index: r.seg_index, field: r.field });
      }
      // cands.length > 1(모호)은 위치 유지(자가치유가 조회 때 처리).
    }
    return { relocated, orphaned };
  }

  /** 한 법령의 교정·메모를 현재 베이스에 재정착 + 고아 리포트. */
  async reanchor(code: string): Promise<{
    overrides: { relocated: number; orphaned: Array<{ article_no: string; seg_index: number; field?: string }> };
    memos: { relocated: number; orphaned: Array<{ article_no: string; seg_index: number }> };
  }> {
    const idx = ForeignModel.buildAnchorIndex(await this.getBaseSegRows(code));
    const overrides = await this.reanchorTable('foreign_override', code, idx);
    const memos = await this.reanchorTable('foreign_memo', code, idx);
    return { overrides, memos: { relocated: memos.relocated, orphaned: memos.orphaned.map(o => ({ article_no: o.article_no, seg_index: o.seg_index })) } };
  }
  // (즐겨찾기는 회원별 북마크로 일반화 → FavoriteModel/ldb_auth.favorite 로 이전)
}
