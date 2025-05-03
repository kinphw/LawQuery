import { LawTreeNode } from '../types/LawTreeNode';
export class LawTextFilterModel {

    filterByText(text: string, nodes: LawTreeNode[]): LawTreeNode[] {
        // this.currentSearchText = text;
        if (!text) return nodes;
        const lower = text.toLowerCase();
    
        function filterNode(node: LawTreeNode): LawTreeNode | null {
            const match = node.title?.toLowerCase().includes(lower);
            const filteredChildren = node.children
                ? node.children.map(filterNode).filter(Boolean) as LawTreeNode[]
                : [];
            if (match || filteredChildren.length) {
                return { ...node, children: filteredChildren };
            }
            return null;
        }
    
        return nodes.map(filterNode).filter(Boolean) as LawTreeNode[];
    }        

}