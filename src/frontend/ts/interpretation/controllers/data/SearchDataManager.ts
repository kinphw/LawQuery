
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
    resultPageSize = 50; // 한 번에 표시할 행 수

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

    getVisibleResultsCount(): number {
        return this.visibleResults.length; 
    }

    getResultStartIndex(): number {
        return this.resultStartIndex;   
    }

    hasMoreData(): boolean {
        // 현재 표시된 결과의 마지막 인덱스가 전체 결과보다 작은지 확인
        return (this.resultStartIndex + this.resultPageSize) < this.currentResults.length;
    }

    loadNextPage(): SearchResult[] {
        if (!this.hasMoreData()) {
            return [];
        }

        const startIndex = this.resultStartIndex + this.resultPageSize;
        const nextResults = this.currentResults.slice(
            startIndex,
            startIndex + this.resultPageSize
        );

        this.resultStartIndex = startIndex;
        this.visibleResults = [...this.visibleResults, ...nextResults];

        console.log(`Loaded ${nextResults.length} more results. Current start index: ${this.resultStartIndex}`);
        return nextResults;
    }

}