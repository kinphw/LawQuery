export interface LawTreeNode {
    id: string | null;
    id_aa?: string;
    title: string | null;
    scheduledTitle?: string | null; // 시행예정 내용
    scheduledDate?: string | null;  // 시행예정일 (yyyy-mm-dd)
    children?: LawTreeNode[];
    isTitle?: boolean; // 타이틀 구분용
    isVirtual?: boolean; // 가상 노드 여부
}