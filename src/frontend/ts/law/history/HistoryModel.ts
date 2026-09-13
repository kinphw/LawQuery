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

/** 달라진 조 하나. 그 버전에 조가 없으면 null. 문언은 개정 표기(<개정 …>)를 걷어낸 것. */
export interface HistChange {
    key: string;
    title: string;
    old: string | null;
    new: string | null;
}

export interface HistCompare {
    origin: string;
    old: HistVersion;
    new: HistVersion;
    changes: HistChange[];
    total: { old: number; new: number };
}

export class HistoryModel {

    async getTiers(): Promise<HistTier[]> {
        try {
            const res = await fetch(ApiUrlBuilder.build('/api/law/history/versions'));
            const { data } = await res.json() as { success: boolean; data: HistTier[] };
            return data ?? [];
        } catch {
            return [];
        }
    }

    async compare(origin: string, oldRef: string, newRef: string): Promise<HistCompare | null> {
        const url = ApiUrlBuilder.build('/api/law/history/compare')
            + `&origin=${encodeURIComponent(origin)}&old=${encodeURIComponent(oldRef)}&new=${encodeURIComponent(newRef)}`;
        try {
            const res = await fetch(url);
            const body = await res.json() as { success: boolean; data?: HistCompare };
            return body.success && body.data ? body.data : null;
        } catch {
            return null;
        }
    }
}
