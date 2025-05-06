import { LawPenalty } from '../types/LawPenalty';

export class LawFetchPenaltyModel {
    async getPenalties(id_a?:string[]): Promise<LawPenalty[]> {

        let url = '/api/law/penalty';
        if (id_a && id_a.length > 0) {
            const params = id_a.map(id => `id_a=${encodeURIComponent(id)}`).join('&');
            url += `?${params}`;
        }

        const response = await fetch(url);
        if (!response.ok) throw new Error('벌칙 데이터를 불러오지 못했습니다.');
        const { data } = await response.json() as { success: boolean; data: LawPenalty[] };
        return data;
    }
}