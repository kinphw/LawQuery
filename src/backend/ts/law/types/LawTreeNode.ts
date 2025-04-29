export interface LawTreeNode {
  id: string | null;
  id_aa?: string;
  title: string | null;
  children?: LawTreeNode[];
  isTitle?: boolean; // 타이틀 구분용
}