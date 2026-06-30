/** 법령 목록 1건 — 백엔드가 ldb_* DB를 스캔해 db_meta 기반으로 구성. */
export interface LawTrackEntry {
    code: string;                       // 'fi', 'sd' (트랙 코드)
    label: string;                      // 토글 표시명(예: 금융투자업)
    rName: string;                      // 그 트랙 감독규정(r) 전체명(표 헤더)
    bName: string;                      // 그 트랙 세칙(b) 전체명
    rShort: string;
    bShort: string;
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
