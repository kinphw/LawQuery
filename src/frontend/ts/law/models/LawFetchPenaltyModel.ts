import { LawPenalty } from '../types/LawPenalty';

export class LawFetchPenaltyModel {
    async getPenalties(): Promise<LawPenalty[]> {
        const response = await fetch('/api/law/penalty');
        if (!response.ok) throw new Error('벌칙 데이터를 불러오지 못했습니다.');
        const { data } = await response.json() as { success: boolean; data: LawPenalty[] };
        return data;
    }
}