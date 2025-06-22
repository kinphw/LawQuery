import { LawTreeNode } from '../types/LawTreeNode';
import ApiUrlBuilder from '../util/ApiUrlBuilder';
export class LawFetchByIdModel {

    async getLawsByIds(lawIds: string[]): Promise<LawTreeNode[]> {

        if (!lawIds.length) return [];

        // 추가 파라미터 생성
        const additionalParams = { id: lawIds };

        // ApiUrlBuilder를 사용하여 URL 생성
        const url = ApiUrlBuilder.buildWithParams('/api/law/get', additionalParams);
        


        // 각 ID를 개별 매개변수로 변환
        // const params = lawIds.map(id => `id=${id}`).join('&');
        // const response = await fetch(`/api/law/get?${params}`);

        // const response = await fetch(`/api/law/get?id=${lawIds.join(',')}`);
        // const data = await response.json() as LawResult[];
        // const { data } = await response.json() as { success: boolean; data: LawResult[] };
        const response = await fetch(url);
        const { data } = await response.json() as { success: boolean; data: LawTreeNode[] };

        // this.currentResults = data;
        // return this.currentResults;
        return data;
    }

}