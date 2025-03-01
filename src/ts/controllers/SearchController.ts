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
    const dataset = new window.Dataset().getDatabaseBinary();
    const db = new Database(dataset);
    await db.init();
    
    // 모델과 뷰 초기화
    this.model = new SearchModel(db);
    this.view = new MainView();

    // 초기 데이터 로드 및 이벤트 바인딩
    this.loadInitialData();
    this.view.bindEvents(() => this.performSearch());
}

  private loadInitialData(): void {
    const results = this.model.search({
      type: "전체",
      serial: "",
      field: "전체",
      keyword: ""
    });
    this.view.render(results);
  }

  private performSearch(): void {
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