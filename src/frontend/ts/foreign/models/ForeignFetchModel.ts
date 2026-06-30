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
   * 관리자 본문 수정(개발계 전용). fields = { text_original?, text_ko?, heading?, heading_ko? }.
   * 성공 true / 실패 false(권한 없음·운영 차단·오류).
   */
  async updateProvision(provisionId: number, fields: Record<string, string>): Promise<boolean> {
    const r = await fetch('/api/foreign/admin/provision', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provision_id: provisionId, ...fields }),
    });
    return r.ok;
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
}
