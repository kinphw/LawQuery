// src/frontend/ts/law/types/LawTreeNode.ts
export interface LawTreeNode {
    id: string;
    id_aa?: string;
    title: string | null;
    children?: LawTreeNode[];
}