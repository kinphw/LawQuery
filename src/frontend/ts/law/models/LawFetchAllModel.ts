import { LawTreeNode } from '../types/LawTreeNode';
import { LawSnapshot } from '../types/LawSnapshot';
import ApiUrlBuilder from '../util/ApiUrlBuilder';

/** /api/law/all 응답(전체 연계표). 날짜 대비(?at=&vs=) 중이면 snapshot 이 함께 온다. */
export interface LawAllResult {
    data: LawTreeNode[];
    snapshot: LawSnapshot | null;
}

export class LawFetchAllModel {

    async getAllLaws(): Promise<LawAllResult> {
        const url: string = ApiUrlBuilder.build('/api/law/all');
        const response = await fetch(url);
        const json = await response.json() as { success: boolean; data: LawTreeNode[]; snapshot?: LawSnapshot };
        return { data: json.data || [], snapshot: json.snapshot ?? null };
    }
}
