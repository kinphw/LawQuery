/** 법령 목록 1건 — 백엔드가 ldb_* DB를 스캔해 db_meta 기반으로 구성. */
export interface LawTrackEntry {
    code: string;                       // 'fi', 'sd' (트랙 코드)
    label: string;                      // 토글 표시명(예: 금융투자업)
    // 그 트랙에 실제로 걸린 단들. 트랙단은 법령마다 다르다 — z(자본시장법)는 r·b,
    // p(통신사기피해환급법)는 s·r. 그래서 단 letter 를 필드명에 박지 않는다.
    origins: Array<{ origin: string; name: string; short: string }>;
}

export interface LawListEntry {
    code: string;                       // 'j', 'y', ... (ldb_<code> 의 code)
    label: string;                      // 드롭다운/현재법령 표시명
    step: number;                       // 레벨 수(4/5) — db_meta origin 개수
    names: string[];                    // 단별 전체명(표 헤더)
    originMap: Record<string, string>;  // origin → 약칭(별표/참조 라벨)
    tracks?: LawTrackEntry[];           // 행정규칙 병렬 트랙(멀티트랙 법령만)
}

export class LawFetchListModel {
    /** GET /api/law/list — 존재하는 법령 전체. 실패하면 빈 배열(프론트가 하드코딩 폴백 유지). */
    async getList(): Promise<LawListEntry[]> {
        try {
            const res = await fetch('/api/law/list');
            if (!res.ok) return [];
            const json = await res.json() as { success: boolean; data: LawListEntry[] };
            return json.data || [];
        } catch {
            return [];
        }
    }
}
