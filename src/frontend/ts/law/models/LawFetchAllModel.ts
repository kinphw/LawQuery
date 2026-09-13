import { LawTreeNode } from '../types/LawTreeNode';
import ApiUrlBuilder from '../util/ApiUrlBuilder';

/** /api/law/all 응답(전체 연계표). */
export interface LawAllResult {
    data: LawTreeNode[];
}

export class LawFetchAllModel {

    async getAllLaws(): Promise<LawAllResult> {
        const url: string = ApiUrlBuilder.build('/api/law/all');
        const response = await fetch(url);
        const json = await response.json() as { success: boolean; data: LawTreeNode[] };
        return { data: json.data || [] };
    }


}