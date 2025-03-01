// import { SearchModel } from '../models/SearchModel';
// import { MainView } from '../views/MainView';
// import { SearchCriteria } from '../types/types';

/// <reference path="./IController.ts" />
/// <reference path="../models/SearchModel.ts" />
/// <reference path="../types/types.ts" />

class SearchController implements IController {
  constructor(
    private model: SearchModel,
    private view: MainView
  ) {}

  async initialize(): Promise<void> {
    // 데이터베이스 초기화
    const dataset = new window.Dataset().getDatabaseBinary(); // 데이터셋 설정
    const db = new Database(dataset);
    await db.init();
    
    // 모델과 뷰 초기화
    this.model = new SearchModel(db);
    this.view = new MainView();

    // 초기 데이터 로드 및 이벤트 바인딩
    this.loadInitialData(); // 모델로부터 데이터를 받아서 뷰에 렌더링
    this.view.bindEvents(() => this.performSearch()); //이벤트바인딩을 위해 넘기는 화살표함수

    /////////////////// 이하는 참고
    // 이렇게 하면 안됨 - this 컨텍스트 문제 발생 가능
    // this.view.bindEvents(function() { 
    //   this.performSearch(); // this가 window나 undefined를 가리킬 수 있음
    // });
    // 이 경우에도 .bind(this)를 사용하면 해결은 가능함

    // // 올바른 방법 - 화살표 함수 사용
    // this.view.bindEvents(() => this.performSearch()); // this가 SearchController를 정확히 가리킴


}

  private loadInitialData(): void {
    const results = this.model.search({ // 모델에 검색조건을 전달해서 결과를 받음
      type: "전체",
      serial: "",
      field: "전체",
      keyword: ""
    });
    this.view.render(results); // 받은 결과를 뷰에 전달해서 렌더링
  }

  private performSearch(): void { // 이벤트바인딩하는 함수 (화살표함수로 넘김)
    const criteria: SearchCriteria = {
      type: (document.getElementById('typeSelect') as HTMLSelectElement).value,
      serial: (document.getElementById('serialInput') as HTMLInputElement).value,
      field: (document.getElementById('fieldSelect') as HTMLSelectElement).value,
      keyword: (document.getElementById('keywordInput') as HTMLInputElement).value
    };

    const results = this.model.search(criteria);
    this.view.render(results);
  }
}
window.SearchController = SearchController;