import { LawTreeNode } from '../types/LawTreeNode';
import ApiUrlBuilder from '../util/ApiUrlBuilder';

export class LawFetchPivotModel {

    /**
     * GET /api/law/pivot?law&step&base — PRO 전용.
     * 기준(base) 재배치된 LawTreeNode 트리를 반환(기존 5단표와 동일 렌더 경로 사용). 비-PRO/에러면 빈 배열.
     */
    async getPivot(base: string): Promise<LawTreeNode[]> {
        const url = ApiUrlBuilder.buildWithParams('/api/law/pivot', { base });
        const response = await fetch(url);
        if (!response.ok) return [];
        const json = await response.json() as { success: boolean; data: LawTreeNode[] };
        return json.data || [];
    }
}
