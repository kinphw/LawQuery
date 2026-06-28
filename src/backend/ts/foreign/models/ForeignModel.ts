import DbContext from '../../common/DbContext';

/**
 * 해외법령 데이터 모델.
 *  - 본문(원문·번역·계층)은 sentinel 소유 fin_law_db(law / law_provision)를 단일 소스로 읽는다.
 *  - 개인 메모(5단)는 회원 DB(ldb_auth.foreign_memo)에서 관리한다.
 *
 * 조회는 조문(article) 단위로 묶는다(원문이 항/호로 쪼개진 경우 ordinal 순으로 합침).
 * 번역(text_ko)은 적재 시 각 article의 대표 provision(ordinal 최소)에만 채웠으므로 MAX로 회수한다.
 */
const FIN_DB = 'fin_law_db';
const AUTH_DB = process.env.AUTH_DB || 'ldb_auth';

export interface ForeignLawListItem {
  code: string;
  jurisdiction: string;
  title_ko: string;
  abbrev: string | null;
  status: string;
  law_type: string;
  is_crypto: number;
  provision_count: number;
  ko_count: number; // 번역이 채워진 조문 수(0이면 원문만)
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
  official_citation: string | null;
  source_url: string | null;
  translation_source: string;
}

export interface ForeignProvision {
  provision_id: number; // 그 article의 대표 provision id (메모 키)
  article_no: string;
  part_no: string | null;
  heading: string | null;
  text_original: string | null;
  text_ko: string | null;
}

export class ForeignModel {
  private fin(): DbContext { return DbContext.getInstance(FIN_DB); }
  private auth(): DbContext { return DbContext.getInstance(AUTH_DB); }

  /** 드롭다운용 법령 목록(관할별 정렬, 번역 보유 수 포함). */
  async listLaws(): Promise<ForeignLawListItem[]> {
    return this.fin().query<ForeignLawListItem>(
      `SELECT l.code, l.jurisdiction, l.title_ko, l.abbrev, l.status, l.law_type, l.is_crypto,
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
      `SELECT id, code, jurisdiction, title_original, title_ko, abbrev, status, law_type,
              official_citation, source_url, translation_source
         FROM law WHERE code = ? LIMIT 1`,
      [code]
    );
    return rows[0] || null;
  }

  /** 조문(article) 단위 원문/번역 2단 목록. */
  async getProvisions(code: string): Promise<ForeignProvision[]> {
    return this.fin().query<ForeignProvision>(
      `SELECT
          (SELECT p2.id FROM law_provision p2
            WHERE p2.law_id = p.law_id AND p2.article_no = p.article_no
            ORDER BY p2.ordinal LIMIT 1) AS provision_id,
          p.article_no,
          MIN(p.part_no)  AS part_no,
          MIN(p.heading)  AS heading,
          GROUP_CONCAT(p.text_original ORDER BY p.ordinal SEPARATOR '\n\n') AS text_original,
          MAX(p.text_ko)  AS text_ko
         FROM law_provision p
         JOIN law l ON l.id = p.law_id
        WHERE l.code = ? AND p.article_no IS NOT NULL
        GROUP BY p.article_no
        ORDER BY MIN(p.ordinal)`,
      [code]
    );
  }

  // ── 메모(ldb_auth.foreign_memo) ─────────────────────────────────────────────
  async getMemos(memberId: number, code: string): Promise<Array<{ provision_id: number; memo: string }>> {
    return this.auth().query<{ provision_id: number; memo: string }>(
      `SELECT provision_id, memo FROM foreign_memo WHERE member_id = ? AND law_code = ?`,
      [memberId, code]
    );
  }

  async upsertMemo(memberId: number, provisionId: number, lawCode: string, memo: string): Promise<void> {
    await this.auth().query(
      `INSERT INTO foreign_memo (member_id, provision_id, law_code, memo)
            VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE memo = VALUES(memo), law_code = VALUES(law_code)`,
      [memberId, provisionId, lawCode, memo]
    );
  }

  async deleteMemo(memberId: number, provisionId: number): Promise<void> {
    await this.auth().query(
      `DELETE FROM foreign_memo WHERE member_id = ? AND provision_id = ?`,
      [memberId, provisionId]
    );
  }
}
