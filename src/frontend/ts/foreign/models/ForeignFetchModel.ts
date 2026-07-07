/**
 * 해외법령 fetch 모델. /api/foreign/* 호출.
 * 쿠키 인증을 위해 credentials: 'include'.
 */
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
  ko_count: number;
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
  summary: string | null;
  highlights: string[] | null;
}

export interface ForeignProvision {
  provision_id: number;
  part_no: string | null;
  article_no: string;
  seg_index: number;
  para_no: string | null;
  heading: string | null;
  heading_ko: string | null;
  seg_kind: string;
  depth: number;              // 계층 깊이 — 프론트 들여쓰기용
  text_original: string | null;
  text_ko: string | null;
}

export class ForeignFetchModel {
  async getList(): Promise<ForeignLawListItem[]> {
    const r = await fetch('/api/foreign/list', { credentials: 'include' });
    const j = await r.json().catch(() => null);
    return j && j.success ? j.data : [];
  }

  async getProvisions(code: string): Promise<{ meta: ForeignLawMeta; provisions: ForeignProvision[]; editable?: boolean } | null> {
    const r = await fetch(`/api/foreign/provisions?code=${encodeURIComponent(code)}`, { credentials: 'include' });
    const j = await r.json().catch(() => null);
    return j && j.success ? j.data : null;
  }

  /**
   * 관리자 본문 교정(오버레이). 논리키 (code, article_no, seg_index) + fields = { text_original?, text_ko?, heading?, heading_ko? }.
   * 값이 있으면 교정 저장, 빈 문자열이면 원본 복귀. 성공 시 effective(저장 후 실효값) 맵, 실패 시 null.
   */
  async saveOverride(
    code: string, articleNo: string, segIndex: number, fields: Record<string, string>
  ): Promise<Record<string, string | null> | null> {
    const r = await fetch('/api/foreign/admin/override', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ law_code: code, article_no: articleNo, seg_index: segIndex, ...fields }),
    });
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    return j && j.success ? (j.effective || {}) : null;
  }

  /** 메모 맵 { "<article_no>|<seg_index>": memo } (운영자 큐레이션, 전역·공개 열람). 실패 시 {}. */
  async getMemos(code: string): Promise<Record<string, string>> {
    const r = await fetch(`/api/foreign/memo?code=${encodeURIComponent(code)}`, { credentials: 'include' });
    const j = await r.json().catch(() => null);
    return j && j.success ? j.data : {};
  }

  /** 메모 저장(빈 문자열이면 서버가 삭제 처리). 운영자 전용. 논리키 (code, article_no, seg_index). */
  async saveMemo(code: string, articleNo: string, segIndex: number, memo: string): Promise<boolean> {
    const r = await fetch('/api/foreign/memo', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ law_code: code, article_no: articleNo, seg_index: segIndex, memo }),
    });
    return r.ok;
  }

  /**
   * 즐겨찾기(회원별 북마크) 키 집합 { "<article_no>|<seg_index>" }. 통합 /api/favorite(scope=foreign).
   * 로그인+승인 회원 전용(비로그인·실패 시 빈 Set).
   */
  async getFavorites(code: string): Promise<Set<string>> {
    const r = await fetch(`/api/favorite?scope=foreign&code=${encodeURIComponent(code)}`, { credentials: 'include' });
    if (!r.ok) return new Set();
    const j = await r.json().catch(() => null);
    return new Set<string>(j && j.success && Array.isArray(j.data) ? j.data : []);
  }

  /** 즐겨찾기 토글(on=true 켜기 / false 끄기). 회원별. node_key = "<article_no>|<seg_index>". */
  async setFavorite(code: string, articleNo: string, segIndex: number, on: boolean): Promise<boolean> {
    const r = await fetch('/api/favorite', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'foreign', law_code: code, node_key: `${articleNo}|${segIndex}`, on }),
    });
    return r.ok;
  }
}
