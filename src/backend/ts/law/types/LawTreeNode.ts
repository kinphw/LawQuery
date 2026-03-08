export interface LawTreeNode {
  id: string | null;
  id_aa?: string;
  title: string | null;
  scheduledTitle?: string | null; // 시행예정 내용
  scheduledDate?: string | null;  // 시행예정일 (yyyy-mm-dd)
  children?: LawTreeNode[];
  isTitle?: boolean; // 타이틀 구분용
  isVirtual?: boolean; // 5단계 구조 유지를 위한 가상 노드 여부
}