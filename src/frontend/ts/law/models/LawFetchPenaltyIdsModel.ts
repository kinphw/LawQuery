// import { LawPenalty } from '../types/LawPenalty';
import ApiUrlBuilder from '../util/ApiUrlBuilder';

export class LawFetchPenaltyIdsModel {
    async getPenaltyIds(): Promise<string[]> {

        const url:string = ApiUrlBuilder.build('/api/law/penaltyIds');        
        const response = await fetch(url); // 새로운 API 엔드포인트
        if (!response.ok) throw new Error('벌칙 데이터를 불러오지 못했습니다.');
        const { data } = await response.json() as { success: boolean; data: string[] };
        return data;
    }
}