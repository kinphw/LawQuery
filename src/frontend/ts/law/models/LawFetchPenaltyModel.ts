import { LawPenalty } from '../types/LawPenalty';
import ApiUrlBuilder from '../util/ApiUrlBuilder';

export class LawFetchPenaltyModel {
    async getPenalty(id_a?:string[], sortBy: 'penalty'|'cause' = 'penalty'): Promise<LawPenalty[]> {

        // // 쿼리 파라미터 구성을 위한 URLSearchParams 객체 생성
        // const params = new URLSearchParams();
        
        // // id_a 배열이 있으면 각각 추가
        // if (id_a && id_a.length > 0) {
        //     id_a.forEach(id => params.append('id_a', id));
        // }
        
        // // sortBy 파라미터가 있으면 추가
        // if (sortBy) {
        //     params.append('sortBy', sortBy);
        // }
        
        // // 쿼리 파라미터가 있으면 URL에 추가
        // let url = '/api/law/penalty';
        // const queryString = params.toString();
        // if (queryString) {
        //     url += `?${queryString}`;
        // }

        // 추가 파라미터 생성
        const additionalParams: Record<string, string | string[]> = {};
        if (id_a && id_a.length > 0) {
            additionalParams['id_a'] = id_a; // 배열 파라미터
        }
        additionalParams['sortBy'] = sortBy; // 정렬 기준

        // ApiUrlBuilder를 사용하여 URL 생성
        const url = ApiUrlBuilder.buildWithParams('/api/law/penalty', additionalParams);
        

        const response = await fetch(url);
        if (!response.ok) throw new Error('벌칙 데이터를 불러오지 못했습니다.');
        const { data } = await response.json() as { success: boolean; data: LawPenalty[] };
        return data;
    }
}