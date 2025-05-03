import { LawTreeNode } from '../types/LawTreeNode';
export class LawFetchByIdModel {

    async getLawsByIds(lawIds: string[]): Promise<LawTreeNode[]> {

        if (!lawIds.length) return [];
        
        // 각 ID를 개별 매개변수로 변환
        const params = lawIds.map(id => `id=${id}`).join('&');
        const response = await fetch(`/api/law/get?${params}`);

        // const response = await fetch(`/api/law/get?id=${lawIds.join(',')}`);
        // const data = await response.json() as LawResult[];
        // const { data } = await response.json() as { success: boolean; data: LawResult[] };
        const { data } = await response.json() as { success: boolean; data: LawTreeNode[] };

        // this.currentResults = data;
        // return this.currentResults;
        return data;
    }

}