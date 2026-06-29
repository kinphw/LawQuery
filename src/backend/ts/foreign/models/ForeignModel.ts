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

  /** 드롭다운용 법령 목록(관할별 정렬, 번역 보유 seg 수 포함). */
  async listLaws(): Promise<ForeignLawListItem[]> {
    return this.fin().query<ForeignLawListItem>(
      `SELECT l.code, l.jurisdiction, l.title_ko, l.title_original, l.abbrev, l.status, l.law_type, l.is_crypto,
              l.provision_count,
              CAST(SUM(p.text_ko IS NOT NULL AND p.text_ko <> '') AS UNSIGNED) AS ko_count
         FROM law l
         LEFT JOIN law_provision p ON p.law_id = l.id
        GROUP BY l.id
        ORDER BY FIELD(l.jurisdiction, 'eu', 'us', 'jp', 'hk', 'sg', 'other'), l.code`
    );
  }

  /** 단일 법령 메타. */
  async getLawMeta(code: string): Promise<ForeignLawMeta | null> {
    const rows = await this.fin().query<ForeignLawMeta>(
      `SELECT id, code, jurisdiction, title_original, title_ko, abbrev, status, law_type, is_crypto,
              official_citation, source_url, translation_source
         FROM law WHERE code = ? LIMIT 1`,
      [code]
    );
    return rows[0] || null;
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

  // ── 메모(ldb_auth.foreign_memo) — 논리키 (law_code, article_no, seg_index) ─────
  /** { "<article_no>|<seg_index>": memo } 맵 */
  async getMemos(memberId: number, code: string): Promise<Record<string, string>> {
    const rows = await this.auth().query<{ article_no: string; seg_index: number; memo: string }>(
      `SELECT article_no, seg_index, memo FROM foreign_memo WHERE member_id = ? AND law_code = ?`,
      [memberId, code]
    );
    const map: Record<string, string> = {};
    rows.forEach(r => { map[`${r.article_no}|${r.seg_index}`] = r.memo; });
    return map;
  }

  async upsertMemo(memberId: number, code: string, articleNo: string, segIndex: number, memo: string): Promise<void> {
    await this.auth().query(
      `INSERT INTO foreign_memo (member_id, law_code, article_no, seg_index, memo)
            VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE memo = VALUES(memo)`,
      [memberId, code, articleNo, segIndex, memo]
    );
  }

  async deleteMemo(memberId: number, code: string, articleNo: string, segIndex: number): Promise<void> {
    await this.auth().query(
      `DELETE FROM foreign_memo WHERE member_id = ? AND law_code = ? AND article_no = ? AND seg_index = ?`,
      [memberId, code, articleNo, segIndex]
    );
  }
}
