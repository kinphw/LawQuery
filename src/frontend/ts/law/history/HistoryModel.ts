import ApiUrlBuilder from '../util/ApiUrlBuilder';

/** 연혁 버전 1행. ver_ref = 'MST@시행일자'(법·시행령) | 행정규칙일련번호. */
export interface HistVersion {
    origin: string;
    track: string | null;
    ver_ref: string;
    ef_date: string;
    prom_date: string | null;
    prom_no: string | null;
    rev_kind: string | null;
    status: string | null;      // 현행 | 연혁 | 시행예정
    name: string | null;
    kind_name: string | null;
    article_count: number;
}

/** 한 단(법률·시행령·…)과 그 버전들(시행일 오름차순). */
export interface HistTier {
    origin: string;
    short_name: string;
    full_name: string;
    versions: HistVersion[];
}

export class HistoryModel {

    /** 단별 연혁 버전. 연혁 미적재 DB·로컬판이면 빈 배열 → 시점 바를 그리지 않는다. */
    async getTiers(): Promise<HistTier[]> {
        try {
            const res = await fetch(ApiUrlBuilder.build('/api/law/history/versions'));
            const { data } = await res.json() as { success: boolean; data: HistTier[] };
            return data ?? [];
        } catch {
            return [];
        }
    }
}
