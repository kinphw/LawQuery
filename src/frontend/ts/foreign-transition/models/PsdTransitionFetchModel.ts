export type PsdLawCode = 'eu_psd2' | 'eu_emd2' | 'eu_psd3' | 'eu_psr';
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

export interface TransitionCatalog {
  version: TransitionVersion;
  laws: TransitionCatalogLaw[];
  conflictCount: number;
  themeCount: number;
  unlocked: boolean;
}

export interface TransitionThemeLink {
  lawCode: PsdLawCode;
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

export interface TransitionThemesData {
  version: TransitionVersion;
  themes: TransitionTheme[];
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
}

export interface TransitionViewData {
  version: TransitionVersion;
  articles: TransitionArticleAnalysis[];
  editable: boolean;
}

export class PsdTransitionFetchModel {
  async getCatalog(): Promise<TransitionCatalog | null> {
    const response = await fetch('/api/foreign-transition/catalog', { credentials: 'include' });
    if (!response.ok) return null;
    const json = await response.json();
    return json.success ? json.data : null;
  }

  async getThemes(version: string): Promise<TransitionThemesData | null> {
    const response = await fetch(
      `/api/foreign-transition/themes?version=${encodeURIComponent(version)}`,
      { credentials: 'include' },
    );
    if (!response.ok) return null;
    const json = await response.json();
    return json.success ? json.data : null;
  }

  async getView(code: PsdLawCode, version: string): Promise<TransitionViewData | null> {
    const response = await fetch(
      `/api/foreign-transition/view?code=${encodeURIComponent(code)}&version=${encodeURIComponent(version)}`,
      { credentials: 'include' },
    );
    if (!response.ok) return null;
    const json = await response.json();
    return json.success ? json.data : null;
  }

  async saveAssessment(input: {
    version: string;
    code: PsdLawCode;
    articleNo: string;
    changeType: ChangeType;
    summaryKo: string;
    detailKo: string;
  }): Promise<boolean> {
    const response = await fetch('/api/foreign-transition/admin/assessment', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return response.ok;
  }
}
