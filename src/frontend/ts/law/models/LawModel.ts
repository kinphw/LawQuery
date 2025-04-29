// import { LawDatabase } from './LawDatabase';
import { LawResult } from '../types/LawResult';
import { LawTitle } from '../types/LawTitle';
import { LawTreeNode } from '../types/LawTreeNode';

export class LawModel {
    // constructor(private db: LawDatabase) {}

    // private currentResults: LawResult[] = [];
    private currentResults: LawTreeNode[] = [];

    // async getAllLaws(): Promise<LawResult[]> {
    async getAllLaws(): Promise<LawTreeNode[]> {
        const response = await fetch('/api/law/all');
        // const data = await response.json();
        // this.currentResults = data;

        // ✅ 백엔드에서 배열 그대로 보내므로 타입 캐스팅만 간단히
        // const data = await response.json() as LawResult[];
        // const { data } = await response.json() as { success: boolean; data: LawResult[] };
        const { data } = await response.json() as { success: boolean; data: LawTreeNode[] };

        this.currentResults = data;
        return this.currentResults;

    }

    // 체크박스에서 ID별로 조회할때 사용
    // async getLawsByIds(lawIds: string[]): Promise<LawResult[]> {
        async getLawsByIds(lawIds: string[]): Promise<LawTreeNode[]> {

        if (!lawIds.length) return [];
        
        // 각 ID를 개별 매개변수로 변환
        const params = lawIds.map(id => `id=${id}`).join('&');
        const response = await fetch(`/api/law/get?${params}`);

        // const response = await fetch(`/api/law/get?id=${lawIds.join(',')}`);
        // const data = await response.json() as LawResult[];
        // const { data } = await response.json() as { success: boolean; data: LawResult[] };
        const { data } = await response.json() as { success: boolean; data: LawTreeNode[] };

        this.currentResults = data;
        return this.currentResults;
    }

    // 법령 제목을 가져오는 메소드
    // getLawTitles(): Array<LawTitle> {
    //     const query = `
    //         SELECT 
    //             id_a, 
    //             title_a,
    //             CASE WHEN id_a IS NULL THEN 1 ELSE 0 END as isTitle 
    //         FROM db_a 
    //         ORDER BY id
    //     `;
    //     return this.db.executeQuery(query);
    // }  
    async getLawTitles(): Promise<LawTitle[]> {
        const response = await fetch('/api/law/getTitles');
        // const data = await response.json() as LawTitle[];
        const { data } = await response.json() as { success: boolean; data: LawTitle[] };
        return data;
    }

    // 검색기능 추가
    private currentSearchText: string = '';

    // filterByText(text: string, results: LawResult[]): LawResult[] {
    // filterByText(text: string, results: LawResult[]): LawResult[] {
    // filterByText(text: string, results: LawTreeNode[]): LawTreeNode[] {
    //     this.currentSearchText = text;  // 검색어 저장
    //     if (!text) return results;
        
    //     return results.filter(row => {
    //         return ['law_content', 'decree_content', 'regulation_content', 'rule_content']
    //             .some(field => row[field]?.toLowerCase().includes(text.toLowerCase()));
    //     });
    // }
    filterByText(text: string, nodes: LawTreeNode[]): LawTreeNode[] {
        this.currentSearchText = text;
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

    getCurrentSearchText(): string {
        return this.currentSearchText;
    } 

}