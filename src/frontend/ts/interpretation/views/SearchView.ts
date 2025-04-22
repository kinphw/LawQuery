import { Header } from "../../common/components/Header";
import { ToastManager } from "../../common/components/ToastManager";
import { SearchResult } from "../types/SearchResult";
import { SearchForm } from "./components/SearchForm";
import { SearchResultTable } from "./components/SearchResultTable";

export class SearchView {
  public header: Header;
  public searchForm: SearchForm;
  public resultTable: SearchResultTable;
  private toastManager: ToastManager;
  private resultsContainer: HTMLElement | null;

  constructor() {
    this.header = new Header();
    this.searchForm = new SearchForm();
    this.resultTable = new SearchResultTable();
    this.toastManager = new ToastManager();
    this.resultsContainer = document.getElementById('results');

    this.renderHeader();
  }

  // render(results: SearchResult[]): void {
  //   if (!this.resultsContainer) return;
    
  //   const html = this.resultTable.render(results);
  //   this.resultsContainer.innerHTML = html;
  // }
// 2. SearchView.ts의 render 메서드 수정 - 스크롤 가능한 테이블 구조 확보
  render(results: SearchResult[]): void {
    if (!this.resultsContainer) return;
    
    if (results.length === 0) {
      this.resultsContainer.innerHTML = '<div class="alert alert-warning">검색 결과가 없습니다.</div>';
      return;
    }

    // // 초기 렌더링 시 startIndex 초기화
    // this.resultTable.setStartIndex(0);    
    
    // 테이블 구조를 항상 유지하도록 수정
    const tableHtml = `
      <table id="searchResultTable" class="table table-bordered table-hover" style="table-layout: fixed; width: 100%;">
        <thead class="table-light sticky-top">
          <tr>
            <th class="text-center align-middle text-nowrap w-10">구분</th>
            <td class="text-center align-middle w-10" style="word-break: break-word">분야</th>
            <th class="text-center align-middle text-nowrap w-50">제목</th>
            <th class="text-center align-middle text-nowrap w-10">일련번호</th>
            <th class="text-center align-middle text-nowrap w-10">회신일자</th>
          </tr>
        </thead>
        <tbody>
          ${this.resultTable.generateRows(results, 0)}
        </tbody>
      </table>`;
    
    this.resultsContainer.innerHTML = tableHtml;
  }  

  renderHeader(): void {
    const headerContainer = document.getElementById('header');
    if (headerContainer) {
      // 'interpretation' 페이지를 현재 페이지로 지정
      headerContainer.innerHTML = this.header.render('interpretation');
    }
  }

  showToast(message: string): void {
    this.toastManager.showToast(message);
  }

  showLoading(): void {
    const loadingHtml = `
      <div id="loadingIndicator" class="position-fixed top-50 start-50 translate-middle">
        <div class="spinner-border text-primary" style="width: 3rem; height: 3rem;" role="status">
          <span class="visually-hidden">로딩중...</span>
        </div>
      </div>
    `;
    
    // 로딩 인디케이터가 없으면 추가
    if (!document.getElementById('loadingIndicator')) {
      const div = document.createElement('div');
      div.innerHTML = loadingHtml;
      document.body.appendChild(div.firstElementChild as Node);
    }
  }

  hideLoading(): void {
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
      loadingIndicator.remove();
    }
  }

// SearchView 클래스에 추가할 메소드
  appendResults(results: SearchResult[]): void {
    const tbody = document.querySelector('#searchResultTable tbody');
    if (!tbody) {
      console.error('테이블 본문을 찾을 수 없습니다.');
      return;
    }

    const startIndex = this.resultTable.getStartIndex();
    const htmlString = this.resultTable.generateRows(results, startIndex);

    // 문자열 HTML을 바로 tbody에 삽입
    tbody.insertAdjacentHTML('beforeend', htmlString);

    this.resultTable.setStartIndex(startIndex + results.length);
    console.log(`${results.length}개 행이 추가되었습니다. 시작 인덱스: ${startIndex}`);
  }
}