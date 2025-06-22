import { LawTreeNode } from '../types/LawTreeNode';
import ApiUrlBuilder from '../util/ApiUrlBuilder';
export class LawFetchAllModel {

    async getAllLaws(): Promise<LawTreeNode[]> {

        // URL 파라미터에서 `law`와 `step` 값을 읽어옴
        // const urlParams = new URLSearchParams(window.location.search);
        // const law = urlParams.get('law') || 'j'; // 기본값: 'j'
        // const step = urlParams.get('step') || '4'; // 기본값: '4'
        const url:string = ApiUrlBuilder.build('/api/law/all');

        // const response = await fetch('/api/law/all');
        const response = await fetch(url);
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