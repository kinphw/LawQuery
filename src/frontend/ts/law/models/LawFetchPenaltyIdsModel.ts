// import { LawPenalty } from '../types/LawPenalty';

export class LawFetchPenaltyIdsModel {
    async getPenaltyIds(): Promise<string[]> {
        const response = await fetch('/api/law/penaltyIds'); // 새로운 API 엔드포인트
        if (!response.ok) throw new Error('벌칙 데이터를 불러오지 못했습니다.');
        const { data } = await response.json() as { success: boolean; data: string[] };
        return data;
    }
}