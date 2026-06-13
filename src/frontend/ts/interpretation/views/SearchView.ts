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

  /**
   * 비회원 티저 안내(검색은 막지 않는다). 검색 폼 위 한 줄 + 전체복사 버튼 숨김.
   * 검색은 가능하되 결과는 상위 3건만 보이고, 클릭하면 본문이 펼쳐진다(인라인).
   */
  showTeaserNote(): void {
    // 비회원에겐 전체복사(대량 본문 요청)는 숨김
    document.getElementById('copyAllBtn')?.classList.add('d-none');

    if (document.getElementById('lqTeaserNote')) return; // 중복 방지
    const note = document.createElement('div');
    note.id = 'lqTeaserNote';
    note.className = 'alert alert-light border d-flex align-items-center gap-2 py-2 small mb-2';
    note.innerHTML =
      '<i class="fas fa-circle-info text-secondary"></i>' +
      '<span>미리보기입니다 — <strong>검색은 상위 3건</strong>, 최근 목록은 <strong>10건</strong>까지 표시됩니다. ' +
      '행을 클릭하면 본문을 볼 수 있어요. <strong>회원가입 시 전체</strong>가 열립니다.</span>';
    const form = document.getElementById('searchForm');
    if (form && form.parentElement) form.parentElement.insertBefore(note, form);
    else if (this.resultsContainer) this.resultsContainer.parentElement?.insertBefore(note, this.resultsContainer);
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