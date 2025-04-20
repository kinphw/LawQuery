import { IController } from "../../common/interfaces/IController";
import { SearchModel } from "../models/SearchModel";
import { SearchView } from "../views/SearchView";
import { SearchCriteria } from "../types/SearchCriteria";
import { SearchResult } from "../types/SearchResult";

export class SearchController implements IController {
  private model: SearchModel;
  private view: SearchView;
  private currentResults: SearchResult[] = [];

  constructor() {
    this.model = new SearchModel();
    this.view = new SearchView();
  }

  async initialize(): Promise<void> {
    // 헤더 렌더링 (뷰 생성자에서 실행됨)
    
    // 초기 데이터 로드
    this.view.showLoading();
    const results = await this.model.getInitialData();
    this.view.hideLoading();
    
    // 초기 데이터 저장
    this.currentResults = results;
    
    // 검색 결과 렌더링
    this.view.render(results);
    
    // 결과 건수 표시
    const count = this.model.getLastSearchCount();
    this.view.showToast(`총 ${count}건의 유권해석 데이터가 로드되었습니다.`);
    
    // 이벤트 바인딩
    this.bindEvents();
  }

  private bindEvents(): void {
    this.bindHeaderEvents();
    this.bindTextSizeEvents();
    this.bindSearchEvents();
  }

  private bindHeaderEvents(): void {
    this.view.header.setInfoButtonHandler();
  }

  private bindTextSizeEvents(): void {
    document.querySelectorAll('input[name="textSize"]').forEach(radio => {
      radio.addEventListener('change', (e: Event) => this.handleTextSizeChange(e));
    });
  }

  private bindSearchEvents(): void {
    this.view.searchForm.setSearchHandler(() => this.performSearch());
    this.bindRowClickEvents();
  }

  private bindRowClickEvents(): void {
    document.querySelectorAll('.search-result-row').forEach(row => {
      row.addEventListener('click', async (e) => {
        const target = e.currentTarget as HTMLElement;
        const index = target.getAttribute('data-row-index');
        const id = target.getAttribute('data-id');
        
        if (!id || !index) return;
        
        const detailRow = document.getElementById(`detail-${index}`);
        if (!detailRow) return;
        
        // 이미 상세 정보가 로드되었는지 확인
        if (detailRow.getAttribute('data-loaded') === 'true') {
          detailRow.classList.toggle('d-none');
          return;
        }
        
        // 상세 정보 로드 중 표시
        detailRow.innerHTML = '<td colspan="5" class="text-center p-3"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div></td>';
        detailRow.classList.remove('d-none');
        
        // 상세 정보 API 호출
        try {
          const detail = await this.model.getDetail(parseInt(id, 10));
          
          if (detail) {
            detailRow.innerHTML = `
              <td colspan="5" class="bg-light">
                <div><strong>질의요지:</strong><br>${this.view.resultTable.formatMultiline(detail.질의요지)}</div>
                <br>
                <div class="mt-2"><strong>회답:</strong><br>${this.view.resultTable.formatMultiline(detail.회답)}</div>
                <br>
                <div class="mt-2"><strong>이유:</strong><br>${this.view.resultTable.formatMultiline(detail.이유)}</div>
              </td>
            `;
            detailRow.setAttribute('data-loaded', 'true');
          } else {
            detailRow.innerHTML = '<td colspan="5" class="text-center text-danger">상세 정보를 불러올 수 없습니다.</td>';
          }
        } catch (error) {
          detailRow.innerHTML = '<td colspan="5" class="text-center text-danger">상세 정보를 불러오는 중 오류가 발생했습니다.</td>';
          console.error('Detail loading error:', error);
        }
      });
    });
  }

  private handleTextSizeChange(e: Event): void {
    const target = e.target as HTMLInputElement;
    this.view.resultTable.setTextSize(target.value);
    this.view.render(this.currentResults);
    this.bindRowClickEvents();
  }

  private async performSearch(): Promise<void> {
    const criteria: SearchCriteria = {
      type: (document.getElementById('typeSelect') as HTMLSelectElement).value,
      serial: (document.getElementById('serialInput') as HTMLInputElement).value,
      field: (document.getElementById('fieldSelect') as HTMLSelectElement).value,
      keyword: (document.getElementById('keywordInput') as HTMLInputElement).value
    };

    this.view.showLoading();
    const results = await this.model.search(criteria);
    this.view.hideLoading();

    this.currentResults = results;
    this.view.render(results);

    const count = this.model.getLastSearchCount();
    this.view.showToast(`검색 완료: 총 ${count}건이 조회되었습니다.`);

    this.bindRowClickEvents();
  }
}