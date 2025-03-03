// import { SearchModel } from '../models/SearchModel';
// import { MainView } from '../views/MainView';
// import { SearchCriteria } from '../types/types';

/// <reference path="./IController.ts" />
/// <reference path="../models/SearchModel.ts" />
/// <reference path="../types/types.ts" />
/// ㄴㄴ

class SearchController implements IController {

  // 모델이 반환한 검색결과 저장 (재렌더링시 사용)
  private currentResults: SearchResult[] = []; // 추가

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
    this.view = new MainView(); // 헤더는 뷰 생성자에서 렌더링됨

    // 초기 데이터 로드
    const results = this.model.getInitialData();

    // 초기 데이터 저장(크기변환을 위해)
    this.currentResults = results; // 검색 결과 저장

    // Results 렌더링    
    this.view.render(results); // 뷰에 데이터를 전달해서 렌더링

    // 이벤트 바인딩을 컨트롤러에서 일괄 처리
    this.bindEvents();
  }
  // 이벤트바인딩 함수 : 래퍼

  private bindEvents(): void {

    // 헤더 이벤트
    this.bindHeaderEvents();

    // 글자크기 이벤트
    this.bindTextSizeEvents();    

    // 검색 폼 이벤트
    // this.view.searchForm.setSearchHandler(() => this.performSearch());
    this.bindSearchEvents();
    
    // 결과 테이블 이벤트
    // this.view.resultTable.setRowClickHandler();
    this.bindRowClickEvents();
  } 

  // 개별 이벤트바인딩 함수 > 이벤트핸들러가 호출할 때 이름만으로 호출하기 쉽게 래핑핑

  private bindHeaderEvents(): void { // 헤더 이벤트바인딩    
    this.view.header.setInfoButtonHandler(); 
  }

  private bindTextSizeEvents(): void {
    document.querySelectorAll('input[name="textSize"]').forEach(radio => {
        radio.addEventListener('change', (e: Event) => this.handleTextSizeChange(e));        
    });    
  }

  private bindSearchEvents(): void {
    this.view.searchForm.setSearchHandler(() => this.performSearch());
  }

  private bindRowClickEvents(): void {
    this.view.resultTable.setRowClickHandler();
  }


  // 이벤트핸들러

  private handleTextSizeChange(e: Event): void {
    const target = e.target as HTMLInputElement;
    this.view.resultTable.setTextSize(target.value);
    this.view.render(this.currentResults);
    this.bindRowClickEvents(); //렌더링했으므로 RowClick도 다시 바인딩
  }  

  private performSearch(): void { // 이벤트바인딩하는 함수 (화살표함수로 넘김)
    const criteria: SearchCriteria = {
      type: (document.getElementById('typeSelect') as HTMLSelectElement).value,
      serial: (document.getElementById('serialInput') as HTMLInputElement).value,
      field: (document.getElementById('fieldSelect') as HTMLSelectElement).value,
      keyword: (document.getElementById('keywordInput') as HTMLInputElement).value
    };

    const results = this.model.search(criteria);
    this.currentResults = results; // 검색 결과 저장 (그래야 텍스트 크기 조절 가능)
    this.view.render(results);

    // 모든 이벤트를 다시 바인딩
    // this.bindEvents();    
    this.bindRowClickEvents(); // 검색결과가 바뀌었으므로 RowClick도 다시 바인딩
  }
}
window.SearchController = SearchController;