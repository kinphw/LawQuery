/** 날짜 대비(?at=&vs=) 응답의 부가 정보 — 백엔드 SnapshotOverlay 의 SnapshotMeta 와 같은 모양. */
export interface SnapVersion {
    ef_date: string;
    prom_no: string | null;
    rev_kind: string | null;
    status: string | null;
    name: string | null;
    kind_name: string | null;
}

export interface LawSnapshot {
    at: string;
    vs: string | null;
    older: string;
    newer: string;
    tiers: Record<string, { older: SnapVersion | null; newer: SnapVersion | null }>;
    /** 두 날짜 중 어느 쪽엔 있었지만 지금 연계표에는 자리가 없는 조(삭제·번호 이동). */
    gone: Array<{ tier: string; key: string; title: string; older: string | null; newer: string | null }>;
}
