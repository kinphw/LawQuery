import DbContext from '../../common/DbContext';
import { ResultSetHeader } from 'mysql2/promise';

const FIN_DB = 'fin_law_db';
const AUTH_DB = process.env.AUTH_DB || 'ldb_auth';
// 기본은 2026 잠정합의문. 최종 목적이 "PSD2/EMD2 가 어떻게 되는가"라 최신 문안을 본다.
// 2023 제안본은 ?version=eu_psd_commission_2023 으로 접근(데이터·상관표 보존).
export const DEFAULT_TRANSITION_VERSION = 'eu_psd_agreed_2026';

// 버전마다 미래측 법코드가 다르다(2026 은 _2026 접미). 현행측(PSD2·EMD2)은 공통.
const VERSION_LAW_CODES: Record<string, readonly string[]> = {
  eu_psd_commission_2023: ['eu_psd2', 'eu_emd2', 'eu_psd3', 'eu_psr'],
  eu_psd_agreed_2026: ['eu_psd2', 'eu_emd2', 'eu_psd3_2026', 'eu_psr_2026'],
};
const ALL_PSD_LAW_CODES = ['eu_psd2', 'eu_emd2', 'eu_psd3', 'eu_psr', 'eu_psd3_2026', 'eu_psr_2026'] as const;
export type PsdLawCode = typeof ALL_PSD_LAW_CODES[number];

/** 버전별 노출 법코드(순서 = 탭 정렬). 미상 버전은 2026 로 폴백. */
export function lawCodesForVersion(versionCode: string): readonly string[] {
  return VERSION_LAW_CODES[versionCode] || VERSION_LAW_CODES[DEFAULT_TRANSITION_VERSION];
}
/** 어느 버전이든 유효한 PSD 법코드인지(컨트롤러 입력 검증용). */
export const PSD_LAW_CODES = ALL_PSD_LAW_CODES;

export type StructuralType = 'one_to_one' | 'split' | 'merge' | 'many_to_many' | 'new' | 'deleted' | 'pending';
export type ChangeType = 'maintained' | 'clarified' | 'strengthened' | 'relaxed' | 'material_change' | 'pending';
export type ReviewStatus = 'automatic' | 'analyzed' | 'reviewed';
export type ThemeImpact = 'new' | 'strengthened' | 'relaxed' | 'clarified' | 'restructured' | 'maintained';

export interface TransitionVersion {
  code: string;
  labelKo: string;
  basisKo: string;
  asOfDate: string;
  lifecycle: string;
  sourceUrls: string[];
  noticeKo: string;
}

export interface TransitionCatalogLaw {
  code: PsdLawCode;
  abbrev: string;
  titleKo: string;
  status: string;
  side: 'current' | 'future';
  articleCount: number;
  mappedCount: number;
  newCount: number;
  deletedCount: number;
  pendingCount: number;
  reviewedCount: number;
}

export interface TransitionAssessment {
  structuralType: StructuralType;
  changeType: ChangeType;
  summaryKo: string;
  detailKo: string;
  similarityPct: number | null;
  reviewStatus: ReviewStatus;
}

export interface TransitionCounterpart {
  lawCode: PsdLawCode;
  abbrev: string;
  titleKo: string;
  articleNo: string | null;
  displayRef: string;
}

export interface TransitionRelation {
  groupId: number;
  groupKey: string;
  relationShape: string;
  evidenceStatus: 'both' | 'psd3_annex' | 'psr_annex' | 'conflict';
  conflictNote: string | null;
  sourceRowNo: number;
  selfRefs: string[];
  counterparts: TransitionCounterpart[];
}

export interface TransitionArticleAnalysis {
  articleNo: string;
  assessment: TransitionAssessment;
  relations: TransitionRelation[];
  /** 조문 자체가 무슨 내용인지(요약표 뷰 가운데 칸). 변경사항(assessment.summaryKo)과 다른 축이다. */
  gistKo: string;
}

export interface TransitionThemeLink {
  lawCode: string;
  articleNo: string;
}

export interface TransitionTheme {
  themeKey: string;
  sortOrder: number;
  categoryKo: string;
  titleKo: string;
  impact: ThemeImpact;
  currentRefKo: string;
  futureRefKo: string;
  summaryKo: string;
  detailKo: string;
  articleLinks: TransitionThemeLink[];
}

function parseJsonArray(value: any): string[] {
  if (Array.isArray(value)) return value.map(String);
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch { return []; }
}

export class PsdTransitionModel {
  private fin(): DbContext { return DbContext.getInstance(FIN_DB); }
  private auth(): DbContext { return DbContext.getInstance(AUTH_DB); }

  async getVersion(code = DEFAULT_TRANSITION_VERSION): Promise<{ id: number; version: TransitionVersion } | null> {
    const rows = await this.auth().query<any>(
      `SELECT id, code, label_ko, basis_ko, DATE_FORMAT(as_of_date, '%Y-%m-%d') AS as_of_date,
              lifecycle, source_urls, notice_ko
         FROM foreign_transition_version
        WHERE code=? AND publish_status='published' LIMIT 1`,
      [code]
    );
    const r = rows[0];
    if (!r) return null;
    return {
      id: Number(r.id),
      version: {
        code: r.code,
        labelKo: r.label_ko,
        basisKo: r.basis_ko,
        asOfDate: r.as_of_date,
        lifecycle: r.lifecycle,
        sourceUrls: parseJsonArray(r.source_urls),
        noticeKo: r.notice_ko,
      },
    };
  }

  /** 전환 드롭박스용 — 게시된 모든 버전(최초본·잠정본…)을 as_of 순으로. */
  async listVersions(): Promise<Array<{ code: string; labelKo: string; asOfDate: string; lifecycle: string }>> {
    const rows = await this.auth().query<any>(
      `SELECT code, label_ko, DATE_FORMAT(as_of_date, '%Y-%m-%d') AS as_of_date, lifecycle
         FROM foreign_transition_version WHERE publish_status='published'
        ORDER BY as_of_date, id`
    );
    return rows.map(r => ({ code: r.code, labelKo: r.label_ko, asOfDate: r.as_of_date, lifecycle: r.lifecycle }));
  }

  async getCatalog(versionCode = DEFAULT_TRANSITION_VERSION): Promise<{ version: TransitionVersion; versions: Array<{ code: string; labelKo: string; asOfDate: string; lifecycle: string }>; laws: TransitionCatalogLaw[]; conflictCount: number; themeCount: number } | null> {
    const found = await this.getVersion(versionCode);
    if (!found) return null;
    const versions = await this.listVersions();
    const codes = lawCodesForVersion(versionCode);
    const placeholders = codes.map(() => '?').join(',');
    const rows = await this.fin().query<any>(
      `SELECT l.code, l.abbrev, l.title_ko, l.status,
              COUNT(a.id) AS article_count,
              SUM(a.structural_type IN ('one_to_one','split','merge','many_to_many')) AS mapped_count,
              SUM(a.structural_type='new') AS new_count,
              SUM(a.structural_type='deleted') AS deleted_count,
              SUM(a.structural_type='pending') AS pending_count,
              SUM(a.review_status='reviewed') AS reviewed_count
         FROM law l
         LEFT JOIN ${AUTH_DB}.foreign_transition_assessment a
           ON a.law_code=l.code AND a.version_id=?
        WHERE l.code IN (${placeholders})
        GROUP BY l.id
        ORDER BY FIELD(l.code,${placeholders})`,
      [found.id, ...codes, ...codes]
    );
    const conflictRows = await this.auth().query<any>(
      `SELECT COUNT(*) AS cnt FROM foreign_transition_group
        WHERE version_id=? AND evidence_status='conflict'`, [found.id]
    );
    const themeRows = await this.auth().query<any>(
      `SELECT COUNT(*) AS cnt FROM foreign_transition_theme
        WHERE version_id=? AND publish_status='published'`, [found.id]
    );
    return {
      version: found.version,
      versions,
      conflictCount: Number(conflictRows[0]?.cnt || 0),
      themeCount: Number(themeRows[0]?.cnt || 0),
      laws: rows.map((r: any) => ({
        code: r.code as PsdLawCode,
        abbrev: r.abbrev,
        titleKo: r.title_ko,
        status: r.status,
        side: (r.code === 'eu_psd2' || r.code === 'eu_emd2') ? 'current' : 'future',
        articleCount: Number(r.article_count || 0),
        mappedCount: Number(r.mapped_count || 0),
        newCount: Number(r.new_count || 0),
        deletedCount: Number(r.deleted_count || 0),
        pendingCount: Number(r.pending_count || 0),
        reviewedCount: Number(r.reviewed_count || 0),
      })),
    };
  }

  /** 정밀 요약표('무엇이 바뀌었나') — 조문별 정밀 대사를 주제 단위로 종합한 큐레이션. 요약 탭용. */
  async getThemes(versionCode = DEFAULT_TRANSITION_VERSION): Promise<{ version: TransitionVersion; themes: TransitionTheme[] } | null> {
    const found = await this.getVersion(versionCode);
    if (!found) return null;
    const rows = await this.auth().query<any>(
      `SELECT theme_key, sort_order, category_ko, title_ko, impact,
              current_ref_ko, future_ref_ko, summary_ko, detail_ko, article_links
         FROM foreign_transition_theme
        WHERE version_id=? AND publish_status='published'
        ORDER BY sort_order, id`,
      [found.id]
    );
    return {
      version: found.version,
      themes: rows.map((r: any) => ({
        themeKey: r.theme_key,
        sortOrder: Number(r.sort_order || 0),
        categoryKo: r.category_ko,
        titleKo: r.title_ko,
        impact: r.impact as ThemeImpact,
        currentRefKo: r.current_ref_ko || '',
        futureRefKo: r.future_ref_ko || '',
        summaryKo: r.summary_ko || '',
        detailKo: r.detail_ko || '',
        articleLinks: this.parseLinks(r.article_links),
      })),
    };
  }

  private parseLinks(value: any): TransitionThemeLink[] {
    const raw = Array.isArray(value) ? value : (() => { try { return JSON.parse(String(value || '[]')); } catch { return []; } })();
    if (!Array.isArray(raw)) return [];
    return raw
      .map((x: any) => ({ lawCode: String(x?.law_code || x?.lawCode || ''), articleNo: String(x?.article_no || x?.articleNo || '') }))
      .filter(x => PSD_LAW_CODES.includes(x.lawCode as PsdLawCode) && x.articleNo);
  }

  async getAnalysis(code: PsdLawCode, versionCode = DEFAULT_TRANSITION_VERSION): Promise<{ version: TransitionVersion; articles: TransitionArticleAnalysis[] } | null> {
    const found = await this.getVersion(versionCode);
    if (!found) return null;
    const assessments = await this.auth().query<any>(
      `SELECT article_no, structural_type, change_type, summary_ko, detail_ko,
              similarity_pct, review_status
         FROM foreign_transition_assessment
        WHERE version_id=? AND law_code=?
        ORDER BY CAST(article_no AS UNSIGNED), article_no`,
      [found.id, code]
    );
    const relationRows = await this.auth().query<any>(
      `SELECT g.id AS group_id, g.group_key, g.relation_shape, g.evidence_status,
              g.conflict_note, g.source_row_no,
              self.article_no AS self_article, self.display_ref AS self_ref,
              other.law_code AS other_code, other.article_no AS other_article,
              other.display_ref AS other_ref,
              l.abbrev AS other_abbrev, l.title_ko AS other_title
         FROM foreign_transition_member self
         JOIN foreign_transition_group g ON g.id=self.group_id AND g.version_id=?
         LEFT JOIN foreign_transition_member other
           ON other.group_id=g.id AND other.side<>self.side
         LEFT JOIN ${FIN_DB}.law l ON l.code=other.law_code
        WHERE self.law_code=? AND self.article_no IS NOT NULL
        ORDER BY CAST(self.article_no AS UNSIGNED), self.article_no,
                 g.source_row_no, other.member_order, other.id`,
      [found.id, code]
    );

    const relationMap = new Map<string, Map<number, TransitionRelation>>();
    for (const r of relationRows) {
      let byGroup = relationMap.get(r.self_article);
      if (!byGroup) relationMap.set(r.self_article, byGroup = new Map());
      let relation = byGroup.get(Number(r.group_id));
      if (!relation) {
        relation = {
          groupId: Number(r.group_id), groupKey: r.group_key, relationShape: r.relation_shape,
          evidenceStatus: r.evidence_status, conflictNote: r.conflict_note,
          sourceRowNo: Number(r.source_row_no), selfRefs: [], counterparts: [],
        };
        byGroup.set(relation.groupId, relation);
      }
      if (r.self_ref && !relation.selfRefs.includes(r.self_ref)) relation.selfRefs.push(r.self_ref);
      if (r.other_code) {
        const key = `${r.other_code}|${r.other_article || ''}|${r.other_ref}`;
        if (!relation.counterparts.some(x => `${x.lawCode}|${x.articleNo || ''}|${x.displayRef}` === key)) {
          relation.counterparts.push({
            lawCode: r.other_code, abbrev: r.other_abbrev || r.other_code,
            titleKo: r.other_title || r.other_code, articleNo: r.other_article,
            displayRef: r.other_ref,
          });
        }
      }
    }

    // 조문 주요내용(요약표 가운데 칸) — 이행분석 version 과 무관한 조문 자체의 속성이라 따로 조회한다.
    const gistRows = await this.auth().query<any>(
      `SELECT article_no, gist_ko FROM foreign_article_gist WHERE law_code=?`, [code]
    );
    const gistMap = new Map<string, string>(
      gistRows.map((g: any) => [g.article_no, g.gist_ko || ''] as [string, string])
    );

    const articles: TransitionArticleAnalysis[] = assessments.map((a: any) => ({
      articleNo: a.article_no,
      assessment: {
        structuralType: a.structural_type,
        changeType: a.change_type,
        summaryKo: a.summary_ko || '',
        detailKo: a.detail_ko || '',
        similarityPct: a.similarity_pct == null ? null : Number(a.similarity_pct),
        reviewStatus: a.review_status,
      },
      relations: [...(relationMap.get(a.article_no)?.values() || [])],
      gistKo: gistMap.get(a.article_no) || '',
    }));
    return { version: found.version, articles };
  }

  async updateAssessment(
    code: PsdLawCode,
    articleNo: string,
    changeType: ChangeType,
    summaryKo: string,
    detailKo: string,
    reviewerId: number,
    versionCode = DEFAULT_TRANSITION_VERSION,
  ): Promise<boolean> {
    const found = await this.getVersion(versionCode);
    if (!found) return false;
    const connection = await this.auth().getConnection();
    try {
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE foreign_transition_assessment
            SET change_type=?, summary_ko=?, detail_ko=?, review_status='reviewed',
                reviewed_by=?, reviewed_at=NOW()
          WHERE version_id=? AND law_code=? AND article_no=?`,
        [changeType, summaryKo, detailKo || null, reviewerId, found.id, code, articleNo]
      );
      return result.affectedRows > 0;
    } finally {
      connection.release();
    }
  }
}
