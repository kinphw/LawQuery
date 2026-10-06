export interface LawTreeNode {
    id: string | null;
    id_aa?: string;
    title: string | null;
    scheduledTitle?: string | null; // 시행예정 내용
    scheduledDate?: string | null;  // 시행예정일 (yyyy-mm-dd)
    // 날짜 대비(?at=&vs=) — 옛 날짜·새 날짜 시행본의 이 칸 문언(그때 없던 조면 null)과 상태.
    // 한 날짜만 찍으면 older 는 null, state 는 same(있음)·absent(없음).
    cmp?: LawCmp | null;
    children?: LawTreeNode[];
    isTitle?: boolean; // 타이틀 구분용
    isVirtual?: boolean; // 가상 노드 여부
    // 개정비교 필터가 맥락으로 끼워 넣은 조 제목행 사본(RevisionFilter) — '변동 없음'으로 흐리지 않는다.
    revContext?: boolean;
}

export interface LawCmp {
    older: string | null;
    newer: string | null;
    state: 'same' | 'changed' | 'added' | 'removed' | 'absent';
}
