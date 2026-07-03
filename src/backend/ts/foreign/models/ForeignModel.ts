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
  text_original: string | null;
  text_ko: string | null;
}

export class ForeignModel {
  private fin(): DbContext { return DbContext.getInstance(FIN_DB); }
  private auth(): DbContext { return DbContext.getInstance(AUTH_DB); }

  // MariaDB JSON 컬럼은 LONGTEXT alias 라 mysql2 가 문자열로 반환 → 배열로 파싱.
  private parseArr(v: any): string[] | null {
    if (v == null) return null;
    if (Array.isArray(v)) return v;
    try { const a = JSON.parse(v); return Array.isArray(a) ? a : null; } catch { return null; }
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
      `SELECT p.id AS provision_id, p.part_no, p.article_no, p.para_no, p.heading, p.heading_ko, p.seg_kind,
              p.text_original, p.text_ko,
              ROW_NUMBER() OVER (PARTITION BY p.article_no ORDER BY p.ordinal) AS seg_index
         FROM law_provision p
         JOIN law l ON l.id = p.law_id
        WHERE l.code = ? AND p.article_no IS NOT NULL
        ORDER BY p.ordinal`,
      [code]
    );
  }

  // ── 본문 교정 레이어(ldb_auth.foreign_override) — 운영에서도 안전한 오탈자 교정 ──
  //    원본(fin_law_db.law_provision)은 STN·번역스크립트 관리 베이스로 불변. 사람 교정은 여기에.
  //    조회 시 베이스 위에 덮어 보여준다(getProvisions). 이관은 fin_law_db만 건드려 교정 무영향.
  /** 교정 가능 컬럼 화이트리스트. 구조 키(article_no/part_no/seg_kind)는 제외(논리키·목차 앵커 보호). */
  static readonly EDITABLE_FIELDS = ['text_original', 'text_ko', 'heading', 'heading_ko'] as const;

  /** 법령 전체 교정 맵 { "<article_no>|<seg_index>|<field>": value }. */
  async getOverrides(code: string): Promise<Record<string, string>> {
    const rows = await this.auth().query<{ article_no: string; seg_index: number; field: string; value: string }>(
      `SELECT article_no, seg_index, field, value FROM foreign_override WHERE law_code = ?`,
      [code]
    );
    const map: Record<string, string> = {};
    rows.forEach(r => { map[`${r.article_no}|${r.seg_index}|${r.field}`] = r.value; });
    return map;
  }

  async upsertOverride(code: string, articleNo: string, segIndex: number, field: string, value: string): Promise<void> {
    await this.auth().query(
      `INSERT INTO foreign_override (law_code, article_no, seg_index, field, value)
            VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value)`,
      [code, articleNo, segIndex, field, value]
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
  /** { "<article_no>|<seg_index>": memo } 맵 (전역) */
  async getMemos(code: string): Promise<Record<string, string>> {
    const rows = await this.auth().query<{ article_no: string; seg_index: number; memo: string }>(
      `SELECT article_no, seg_index, memo FROM foreign_memo WHERE law_code = ?`,
      [code]
    );
    const map: Record<string, string> = {};
    rows.forEach(r => { map[`${r.article_no}|${r.seg_index}`] = r.memo; });
    return map;
  }

  async upsertMemo(code: string, articleNo: string, segIndex: number, memo: string): Promise<void> {
    await this.auth().query(
      `INSERT INTO foreign_memo (law_code, article_no, seg_index, memo)
            VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE memo = VALUES(memo)`,
      [code, articleNo, segIndex, memo]
    );
  }

  async deleteMemo(code: string, articleNo: string, segIndex: number): Promise<void> {
    await this.auth().query(
      `DELETE FROM foreign_memo WHERE law_code = ? AND article_no = ? AND seg_index = ?`,
      [code, articleNo, segIndex]
    );
  }

  // ── 즐겨찾기(ldb_auth.foreign_favorite) — 운영자 개인 강조표시(북마크). 논리키 (law_code, article_no, seg_index) ─
  //    행 존재 = 즐겨찾기 ON. 열람·토글 모두 운영자 전용(강조색은 운영자에게만 노출).
  /** 즐겨찾기 키 목록 ["<article_no>|<seg_index>", …] (해당 법령). */
  async getFavorites(code: string): Promise<string[]> {
    const rows = await this.auth().query<{ article_no: string; seg_index: number }>(
      `SELECT article_no, seg_index FROM foreign_favorite WHERE law_code = ?`,
      [code]
    );
    return rows.map(r => `${r.article_no}|${r.seg_index}`);
  }

  async addFavorite(code: string, articleNo: string, segIndex: number): Promise<void> {
    await this.auth().query(
      `INSERT IGNORE INTO foreign_favorite (law_code, article_no, seg_index) VALUES (?, ?, ?)`,
      [code, articleNo, segIndex]
    );
  }

  async removeFavorite(code: string, articleNo: string, segIndex: number): Promise<void> {
    await this.auth().query(
      `DELETE FROM foreign_favorite WHERE law_code = ? AND article_no = ? AND seg_index = ?`,
      [code, articleNo, segIndex]
    );
  }
}
