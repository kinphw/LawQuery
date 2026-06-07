import ApiUrlBuilder from '../util/ApiUrlBuilder';

/** /unit 단일 단위 조회 결과 행. (법 db_a만 title 포함) */
export interface LawUnitRow {
  seq: number;
  id: string | null;
  title?: string | null;
  content: string | null;
  content_sched: string | null;
  sched_date: string | null;
}

/**
 * 무료(비회원 포함) 단일 단위 조회 모델.
 * /api/law/unit?law=j&origin=s → 한 단(법/시행령/감독규정/세칙)의 모든 조문(seq 순).
 */
export class LawFetchUnitModel {
  async getUnit(origin: string): Promise<LawUnitRow[]> {
    // step은 의미 없지만 ApiUrlBuilder가 law를 붙여준다. origin만 추가.
    const url = ApiUrlBuilder.buildWithParams('/api/law/unit', { origin });
    const response = await fetch(url);
    if (!response.ok) return [];
    const { data } = (await response.json()) as { success: boolean; data: LawUnitRow[] };
    return data ?? [];
  }
}
