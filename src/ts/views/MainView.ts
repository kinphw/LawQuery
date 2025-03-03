// import { Header } from './components/Header';
// import { SearchForm } from './components/SearchForm';
// import { ResultTable } from './components/ResultTable';
// import { SearchResult } from '../types/types';

class MainView {
    
    // HTML 웹앱에서, 개념상 HTML은 렌더링대상 껍데기만 설계하고 세부내용은 뷰에서 동적으로 렌더링해서 붙이는 구조
    // 그리고 이벤트도 여기서 붙임

    // 클래스변수부 : 렌더링 대상 (하위 뷰 클래스)
    public header: Header; // 뷰의 일부. 헤더를 공용으로 쓰기 위해 클래스변수로 선언
    public searchForm: SearchForm; // 검색폼
    public resultTable: ResultTable; // 결과테이블

    constructor() {
        // 즉, Header는 단순 렌더링만 하는 반면, 
        // SearchForm과 ResultTable은 이벤트 바인딩과 상태 관리가 필요한 더 복잡한 컴포넌트라서 
        // 스코프를 분리
        this.header = new window.Header(); // 이미 Header.js파일 <script src>시점에 export되어 있음
        this.searchForm = new SearchForm(); 
        this.resultTable = new ResultTable();
    }

    // 컨트롤러가 호출
    renderAll(results: SearchResult[]): void {
        document.getElementById('header')!.innerHTML = this.header.render('interpretation');
        document.getElementById('results')!.innerHTML = this.resultTable.render(results);

        // 여기에서 이벤트를 다시 바인딩해줘야 함
        // this.header.bindEvents();        
        // this.resultTable.bindEvents();  // 추가
    }

    renderHeader(): void {
        document.getElementById('header')!.innerHTML = this.header.render('interpretation');
    }

    renderResults(results: SearchResult[]): void {
        document.getElementById('results')!.innerHTML = this.resultTable.render(results);
    }

    // 컨트롤러가 호출
    // bindEvents(searchHandler: () => void): void {
    //     // this.searchForm.bindEvents(searchHandler);
    //     // this.resultTable.bindEvents();
    // }
}
window.MainView = MainView;