/**
 * 해외법령 fetch 모델. /api/foreign/* 호출.
 * 쿠키 인증을 위해 credentials: 'include'.
 */
export interface ForeignLawListItem {
  code: string;
  jurisdiction: string;
  title_ko: string;
  abbrev: string | null;
  status: string;
  law_type: string;
  is_crypto: number;
  provision_count: number;
  ko_count: number;
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

  async getProvisions(code: string): Promise<{ meta: ForeignLawMeta; provisions: ForeignProvision[] } | null> {
    const r = await fetch(`/api/foreign/provisions?code=${encodeURIComponent(code)}`, { credentials: 'include' });
    const j = await r.json().catch(() => null);
    return j && j.success ? j.data : null;
  }

  /** 메모 맵 { "<article_no>|<seg_index>": memo }. PRO가 아니거나 비로그인이면 null(401/403). */
  async getMemos(code: string): Promise<Record<string, string> | null> {
    const r = await fetch(`/api/foreign/memo?code=${encodeURIComponent(code)}`, { credentials: 'include' });
    if (r.status === 401 || r.status === 403) return null;
    const j = await r.json().catch(() => null);
    return j && j.success ? j.data : null;
  }

  /** 메모 저장(빈 문자열이면 서버가 삭제 처리). 논리키 (code, article_no, seg_index). */
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
