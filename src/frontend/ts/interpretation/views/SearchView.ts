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

  render(results: SearchResult[], isAppend: boolean = false): void {
    if (!this.resultsContainer) return;

    if (results.length === 0 && !isAppend) {
        this.resultsContainer.innerHTML = '<div class="alert alert-warning">검색 결과가 없습니다.</div>';
        return;
    }

    // 최초 렌더링인 경우
    if (!isAppend) {
        const tableHtml = `
            <table id="searchResultTable" class="table table-bordered table-hover" style="table-layout: fixed; width: 100%;">
                <thead class="table-light sticky-top">
                    <tr>
                        <th class="text-center align-middle text-nowrap w-10 type-cell">구분</th>
                        <th class="text-center align-middle w-10 field-cell">분야</th>
                        <th class="text-center align-middle text-nowrap w-50">제목</th>
                        <th class="text-center align-middle text-nowrap w-10 serial-cell">일련번호</th>
                        <th class="text-center align-middle text-nowrap w-10 date-cell">회신일자</th>
                    </tr>
                </thead>
                <tbody>
                    ${this.resultTable.generateRows(results, 0)}
                </tbody>
            </table>`;
        
        this.resultsContainer.innerHTML = tableHtml;
        this.resultTable.setStartIndex(results.length);
    } 
    // 추가 렌더링인 경우
    else {
        const tbody = document.querySelector('#searchResultTable tbody');
        if (!tbody) {
            console.error('테이블 본문을 찾을 수 없습니다.');
            return;
        }

        const startIndex = this.resultTable.getStartIndex();
        const htmlString = this.resultTable.generateRows(results, startIndex);
        tbody.insertAdjacentHTML('beforeend', htmlString);
        this.resultTable.setStartIndex(startIndex + results.length);
    }
  }  

  renderHeader(): void {
    const headerContainer = document.getElementById('header');
    if (headerContainer) {
      headerContainer.innerHTML = this.header.render('interpretation');
    }
  }

  /** PRO 전용 안내 문구(유권해석은 통째로 PRO 기능 · BETA 전체 공개). */
  showProBetaNote(): void {
    if (!this.resultsContainer || document.getElementById('lqProNote')) return;
    const note = document.createElement('div');
    note.id = 'lqProNote';
    note.className = 'alert alert-light border d-flex align-items-center gap-2 py-2 small';
    note.innerHTML =
      '<span class="badge" style="background:#6f42c1;color:#fff">PRO</span>' +
      '<span><strong>PRO 전용 기능</strong>입니다 (유권해석·비조치의견서) · BETA 기간 전체 공개 중</span>';
    this.resultsContainer.parentElement?.insertBefore(note, this.resultsContainer);
  }

  /** 비PRO(비회원·FREE) 잠금 화면. 유권해석은 통째로 PRO 전용. */
  renderLock(authenticated: boolean): void {
    // 검색 폼 비활성화
    document.querySelectorAll('#searchForm input, #searchForm select, #searchForm button')
      .forEach((el) => ((el as HTMLInputElement).disabled = true));

    if (!this.resultsContainer) return;
    const cta = authenticated
      ? '<span class="text-muted">PRO 등급에서 이용 가능합니다. 관리자에게 문의해 주세요.</span>'
      : '<a href="login.html" class="btn btn-primary btn-lg">가입하고 PRO 베타 이용 →</a>';
    this.resultsContainer.innerHTML = `
      <div class="text-center p-5">
        <div class="display-4 mb-3"><i class="fas fa-lock text-secondary"></i></div>
        <h4 class="mb-2">유권해석·비조치의견서는 PRO 전용입니다</h4>
        <p class="text-muted mb-4">
          흩어져 있어 찾기 어려운 유권해석·법령해석·비조치의견서를<br>
          한 곳에서 검색·조회하는 기능입니다.
        </p>
        <div>${cta}</div>
      </div>`;
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
}