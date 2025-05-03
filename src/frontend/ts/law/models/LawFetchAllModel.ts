import { LawTreeNode } from '../types/LawTreeNode';
export class LawFetchAllModel {

    async getAllLaws(): Promise<LawTreeNode[]> {
        const response = await fetch('/api/law/all');
        // const data = await response.json();
        // this.currentResults = data;

        // ✅ 백엔드에서 배열 그대로 보내므로 타입 캐스팅만 간단히
        // const data = await response.json() as LawResult[];
        // const { data } = await response.json() as { success: boolean; data: LawResult[] };
        const { data } = await response.json() as { success: boolean; data: LawTreeNode[] };

        // this.currentResults = data; // 모델에 직접 쌓지 않는다. 컨트롤러(데이터매니저)가 저장
        // return this.currentResults;
        return data;

    }


}