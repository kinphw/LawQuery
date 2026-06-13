import { LawTreeNode } from '../types/LawTreeNode';
import ApiUrlBuilder from '../util/ApiUrlBuilder';

/** /api/law/all 응답. 비회원/free면 data가 상위 3개 조로 잘리고 locked=true, total=전체 조 수. */
export interface LawAllResult {
    data: LawTreeNode[];
    locked: boolean;
    total: number;
}

export class LawFetchAllModel {

    async getAllLaws(): Promise<LawAllResult> {
        const url: string = ApiUrlBuilder.build('/api/law/all');
        const response = await fetch(url);
        const json = await response.json() as { success: boolean; data: LawTreeNode[]; locked?: boolean; total?: number };
        return { data: json.data || [], locked: !!json.locked, total: json.total || 0 };
    }


}