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

  render(results: SearchResult[]): void {
    if (!this.resultsContainer) return;
    
    const html = this.resultTable.render(results);
    this.resultsContainer.innerHTML = html;
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
}