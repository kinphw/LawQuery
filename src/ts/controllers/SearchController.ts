// import { SearchModel } from '../models/SearchModel';
// import { MainView } from '../views/MainView';
// import { SearchCriteria } from '../types/types';

/// <reference path="./IController.ts" />
/// <reference path="../models/SearchModel.ts" />
/// <reference path="../types/types.ts" />
/// ㄴㄴ

class SearchController implements IController {
  constructor(
    private model: SearchModel,
    private view: MainView
  ) {}

  // 컨트롤러의 run() 역할 래퍼함수
  async initialize(): Promise<void> {
    // 데이터베이스 초기화
    const dataset = new window.Dataset().getDatabaseBinary(); // 데이터셋 설정
    const db = new Database(dataset);
    await db.init();
    
    // 모델과 뷰 초기화
    this.model = new SearchModel(db);
    this.view = new MainView();

    // 초기 데이터 로드
    const results = this.loadInitialData(); // 모델로부터 데이터를 받아서 뷰에 렌더링

    // 렌더링
    this.view.renderAll(results); // 뷰에 데이터를 전달해서 렌더링

    // 이벤트 바인딩을 컨트롤러에서 일괄 처리
    this.bindEvents();
    // this.view.bindEvents(() => this.performSearch()); //이벤트바인딩을 위해 넘기는 화살표함수

}

  private loadInitialData(): SearchResult[] {
    const results = this.model.search({ // 모델에 검색조건을 전달해서 결과를 받음
      type: "전체",
      serial: "",
      field: "전체",
      keyword: ""
    });
    return results;
    // this.view.render(results); // 받은 결과를 뷰에 전달해서 렌더링
  }

  private bindEvents(): void {
    // 검색 폼 이벤트
    this.view.searchForm.setSearchHandler(() => this.performSearch());
    
    // 헤더 이벤트
    this.view.header.setInfoButtonHandler();
    
    // 결과 테이블 이벤트
    this.view.resultTable.setRowClickHandler();
  } 


  private performSearch(): void { // 이벤트바인딩하는 함수 (화살표함수로 넘김)
    const criteria: SearchCriteria = {
      type: (document.getElementById('typeSelect') as HTMLSelectElement).value,
      serial: (document.getElementById('serialInput') as HTMLInputElement).value,
      field: (document.getElementById('fieldSelect') as HTMLSelectElement).value,
      keyword: (document.getElementById('keywordInput') as HTMLInputElement).value
    };

    const results = this.model.search(criteria);
    this.view.renderAll(results);

    // 모든 이벤트를 다시 바인딩
    this.bindEvents();    
  }
}
window.SearchController = SearchController;