
import { SearchModel } from "../../models/SearchModel";
import { ISearchController } from "../SearchController";

import { SearchView } from "../../views/SearchView";
import { SearchCriteria } from "../../types/SearchCriteria";
import { SearchResult } from "../../types/SearchResult";

export class SearchDataManager {

    private controller: ISearchController;

    currentResults: SearchResult[] = [];
    // lazy loading을 위한 변수
    visibleResults: SearchResult[] = []; // 현재 표시되는 결과만 저장
    
    resultStartIndex = 0;
    resultPageSize = 100; // 한 번에 표시할 행 수

    constructor(controller: ISearchController) {
        this.controller = controller; // SearchController 인스턴스를 저장
    }    
    
    async initialize(): Promise<void> {
        // 초기 데이터 로드
        const initialResults = await this.controller.model.getInitialData();
        this.currentResults = initialResults;        
    }

    // getVisibleResults(): SearchResult[] {
    //     return this.currentResults.slice(
    //       this.resultStartIndex, 
    //       this.resultStartIndex + this.resultPageSize
    //     );
    // }

    setVisibleResults(): void {
        this.visibleResults = this.currentResults.slice(
            this.resultStartIndex, 
            this.resultStartIndex + this.resultPageSize
            );
    }
    getVisibleResults(): SearchResult[] {
        return this.visibleResults;
    }
}