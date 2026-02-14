export interface LawTreeNode {
  id: string | null;
  id_aa?: string;
  title: string | null;
  children?: LawTreeNode[];
  isTitle?: boolean; // 타이틀 구분용
  isVirtual?: boolean; // 5단계 구조 유지를 위한 가상 노드 여부
}