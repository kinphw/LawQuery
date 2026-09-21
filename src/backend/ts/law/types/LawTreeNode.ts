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
  isVirtual?: boolean; // 5단계 구조 유지를 위한 가상 노드 여부
}

export interface LawCmp {
  older: string | null;
  newer: string | null;
  state: 'same' | 'changed' | 'added' | 'removed' | 'absent';
}
