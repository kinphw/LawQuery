import { IController } from "../../common/interfaces/IController";
import { SearchModel } from "../models/SearchModel";
import { SearchView } from "../views/SearchView";
import { SearchCriteria } from "../types/SearchCriteria";
import { SearchResult } from "../types/SearchResult";

export class SearchController implements IController {
  private model: SearchModel;
  private view: SearchView;
  private currentResults: SearchResult[] = [];

  // lazy loading을 위한 변수
  private visibleResults: SearchResult[] = []; // 현재 표시되는 결과만 저장
  private resultStartIndex = 0;
  private resultPageSize = 50; // 한 번에 표시할 행 수
  private scrollHandler: () => void;
  private isLoading = false; // 로딩 중복 방지 플래그 추가


  constructor() {
    this.model = new SearchModel();
    this.view = new SearchView();

    this.scrollHandler = this.handleScroll.bind(this);
  }

  async initialize(): Promise<void> {
    // 헤더 렌더링 (뷰 생성자에서 실행됨)
    
    // 초기 데이터 로드
    this.view.showLoading();
    // 초기 데이터 로드
    const initialResults = await this.model.getInitialData();
    this.currentResults = initialResults;
    this.view.hideLoading();

    // 결과 건수 표시
    const count = this.model.getLastSearchCount();
    this.view.showToast(`총 ${count}건의 유권해석 데이터가 로드되었습니다.`);    
    
    // 초기 화면에는 첫 50개만 표시
    this.visibleResults = this.getVisibleResults();
    this.view.render(this.visibleResults);

    // 이벤트 바인딩
    this.bindEvents();    
    
    // 스크롤 이벤트 등록 // lazy loading을 위한 스크롤 이벤트
    window.addEventListener('scroll', this.scrollHandler);    
  }

  private getVisibleResults(): SearchResult[] {
    return this.currentResults.slice(
      this.resultStartIndex, 
      this.resultStartIndex + this.resultPageSize
    );
  }

// 3. handleScroll에서 데이터 추가 시 콘솔 로그 추가
  private handleScroll(): void {
    // 이미 로딩 중이면 중복 요청 방지
    if (this.isLoading) return;
    
    const scrollPosition = window.scrollY;
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    
    // 스크롤이 페이지 하단에 가까워지고, 더 보여줄 데이터가 있을 때
    if (scrollPosition + windowHeight > documentHeight - 300) {
      if (this.resultStartIndex + this.resultPageSize < this.currentResults.length) {
        console.log("Loading more results");
        
        this.isLoading = true;
        
        // 다음 페이지 시작 인덱스 설정
        this.resultStartIndex += this.resultPageSize;
        
        // 다음 페이지 아이템 가져오기
        const nextResults = this.getVisibleResults();
        
        // 화면에 표시된 결과에 추가
        this.visibleResults = [...this.visibleResults, ...nextResults];
        
        // 새 결과를 화면에 추가
        this.view.appendResults(nextResults);
        
        // 새로 추가된 행에 이벤트 바인딩
        this.bindRowClickEvents(this.resultStartIndex);
        
        // 로딩 완료
        this.isLoading = false;
      }
    }
  }


  /////////////

  private bindEvents(): void {
    this.bindHeaderEvents();
    this.bindTextSizeEvents();
    this.bindSearchEvents();
  }

  /////////////

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

  // private bindRowClickEvents(): void {
  private bindRowClickEvents(startIndex: number = 0): void {//  
    

    const endIndex = startIndex + this.resultPageSize;    
    // 범위를 사용하는 방식으로 변경
    const selector = startIndex > 0 ? 
        Array.from({length: this.resultPageSize}, (_, i) => 
            `.search-result-row[data-row-index="${startIndex + i}"]`
        ).join(', ') : 
        '.search-result-row';
    
    console.log(`Binding click events for rows with selector: ${selector}`);
       
    // document.querySelectorAll('.search-result-row').forEach(row => {
    //   row.addEventListener('click', async (e) => {
    document.querySelectorAll(selector).forEach(row => {

    // Log to verify we found the rows
      console.log(`Found row with index: ${row.getAttribute('data-row-index')}`);
    

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

  //////////////////

  private handleTextSizeChange(e: Event): void {
    const target = e.target as HTMLInputElement;
    this.view.resultTable.setTextSize(target.value);
    // this.view.render(this.currentResults);
    // this.bindRowClickEvents();

    // 가상화 데이터 초기화 및 다시 렌더링
    this.resultStartIndex = 0;
    this.visibleResults = this.getVisibleResults();
    this.view.render(this.visibleResults);
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
    // this.view.render(results);
    // 가상화 데이터 초기화
    this.resultStartIndex = 0;
    this.visibleResults = this.getVisibleResults();
    this.view.render(this.visibleResults);    

    const count = this.model.getLastSearchCount();
    this.view.showToast(`검색 완료: 총 ${count}건이 조회되었습니다.`);

    this.bindRowClickEvents();
  }

  dispose(): void {
    // 스크롤 이벤트 핸들러 제거
    window.removeEventListener('scroll', this.scrollHandler);
  }
  
}