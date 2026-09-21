import { LawTreeNode } from '../types/LawTreeNode';
import { LawSnapshot } from '../types/LawSnapshot';
import ApiUrlBuilder from '../util/ApiUrlBuilder';

export class LawFetchPivotModel {

    /**
     * GET /api/law/pivot?law&step&base
     * 기준(base) 재배치된 LawTreeNode 트리를 반환(기존 5단표와 동일 렌더 경로 사용). 에러면 빈 트리.
     * 날짜 대비(?at=&vs=) 중이면 snapshot 이 함께 온다.
     */
    async getPivot(base: string): Promise<{ data: LawTreeNode[]; snapshot: LawSnapshot | null }> {
        const url = ApiUrlBuilder.buildWithParams('/api/law/pivot', { base });
        const response = await fetch(url);
        if (!response.ok) return { data: [], snapshot: null };
        const json = await response.json() as { success: boolean; data: LawTreeNode[]; snapshot?: LawSnapshot };
        return { data: json.data || [], snapshot: json.snapshot ?? null };
    }
}
