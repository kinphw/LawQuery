import { IController } from "../../common/interfaces/IController";
import { SearchModel } from "../models/SearchModel";
import { SearchView } from "../views/SearchView";
import { SearchCriteria } from "../types/SearchCriteria";
import { SearchResult } from "../types/SearchResult";

import { SearchDataManager } from "./data/SearchDataManager";
import { SearchEventManager } from "./event/SearchEventManager";

import { getMe, isPro } from "../../common/AuthState";
import { UpsellNotice } from "../../common/components/UpsellNotice";

export interface ISearchController extends IController { // 의존성 주입을 위한 인터페이스
  model: SearchModel;
  view: SearchView;
  dataManager: SearchDataManager;  
  eventManager: SearchEventManager;
}

export class SearchController implements ISearchController {
  model: SearchModel;
  view: SearchView; 

  dataManager: SearchDataManager;
  
  eventManager: SearchEventManager;

  // // lazy loading을 위한 변수
  // private visibleResults: SearchResult[] = []; // 현재 표시되는 결과만 저장
  // private resultStartIndex = 0;
  // private resultPageSize = 50; // 한 번에 표시할 행 수
  // private scrollHandler: () => void;
  // private isLoading = false; // 로딩 중복 방지 플래그 추가


  constructor() {
    this.model = new SearchModel();
    this.view = new SearchView();

    this.dataManager = new SearchDataManager(this);    
    this.eventManager = new SearchEventManager(this);
    
    // this.scrollHandler = this.handleScroll.bind(this);
  }

  private isTeaser = false;

  async initialize(): Promise<void> {
    // 헤더 렌더링 (뷰 생성자에서 실행됨)
    const me = await getMe();
    this.isTeaser = !isPro(me);

    // 초기 데이터 로드 (비회원이면 서버가 상위 10건 + 그 본문을 내려줌)
    this.view.showLoading();
    await this.dataManager.initialize();
    this.view.hideLoading();

    this.dataManager.setVisibleResults();

    // 비회원 티저: 검색 가능(상위 3건) + 최근목록 10건 + 행 클릭 시 인라인 본문 펼침.
    if (this.isTeaser) {
      this.bindTeaserControls();
      this.renderTeaser(this.dataManager.getVisibleResults());
      this.view.header.setInfoButtonHandler();
      this.view.showToast(`최근 ${this.dataManager.getVisibleResultsCount()}건 미리보기 · 회원가입 시 전체 이용`);
      return;
    }

    // PRO: 전체 흐름
    this.view.render(this.dataManager.getVisibleResults(), false);
    const count = this.model.getLastSearchCount();
    this.view.showToast(`총 ${count}건의 유권해석 조회 (${this.dataManager.getVisibleResultsCount()}/${this.dataManager.currentResults.length})`);

    // 이벤트 바인딩
    this.eventManager.bindEvents();
  }

  /** 비회원 티저 컨트롤(1회): 안내문구·전체복사 숨김 + 검색(상위3) + 글자크기. */
  private bindTeaserControls(): void {
    this.view.showTeaserNote();
    this.view.searchForm.setSearchHandler(() => this.teaserSearch());
    document.querySelectorAll('input[name="textSize"]').forEach((radio) =>
      radio.addEventListener('change', (e) => {
        this.view.resultTable.setTextSize((e.target as HTMLInputElement).value);
        this.renderTeaser(this.dataManager.getVisibleResults());
      })
    );
  }

  /** 티저 렌더: 표 + 행클릭(인라인 본문) + 하단 안내 플레이스홀더. */
  private renderTeaser(rows: SearchResult[]): void {
    this.view.render(rows, false);
    this.bindTeaserRowClicks();
    if (rows.length) {
      UpsellNotice.appendInside('results', '회원가입 시 전체 유권해석을 검색하고 본문을 조회할 수 있습니다');
    }
  }

  /** 비회원 검색: 서버가 상위 3건 + 그 본문만 내려준다. */
  private async teaserSearch(): Promise<void> {
    const criteria: SearchCriteria = {
      type: (document.getElementById('typeSelect') as HTMLSelectElement).value,
      serial: (document.getElementById('serialInput') as HTMLInputElement).value,
      field: (document.getElementById('fieldSelect') as HTMLSelectElement).value,
      keyword: (document.getElementById('keywordInput') as HTMLInputElement).value,
      startDate: (document.getElementById('startDateInput') as HTMLInputElement).value,
      endDate: (document.getElementById('endDateInput') as HTMLInputElement).value,
    };

    this.view.showLoading();
    const results = await this.model.search(criteria);
    this.view.hideLoading();

    this.dataManager.currentResults = results;
    this.dataManager.resultStartIndex = 0;
    this.dataManager.setVisibleResults();
    this.renderTeaser(this.dataManager.getVisibleResults());

    const total = this.model.getLastTotal();
    this.view.showToast(
      results.length
        ? `검색결과 ${total.toLocaleString()}건 중 상위 ${results.length}건 표시 · 전체는 회원가입 시`
        : '검색 결과가 없습니다.'
    );
  }

  /** 티저 행 클릭: 인라인으로 받은 본문을 펼친다(추가 요청 없음 → 보이는 행만 열람). */
  private bindTeaserRowClicks(): void {
    const fmt = (t?: string) => this.view.resultTable.formatMultiline(t || '');
    document.querySelectorAll('.search-result-row').forEach((row) => {
      row.addEventListener('click', () => {
        const el = row as HTMLElement;
        const index = el.getAttribute('data-row-index');
        const id = el.getAttribute('data-id');
        if (index == null || id == null) return;
        const detailRow = document.getElementById(`detail-${index}`);
        if (!detailRow) return;
        if (detailRow.getAttribute('data-loaded') === 'true') {
          detailRow.classList.toggle('d-none');
          return;
        }
        const item = this.dataManager.currentResults.find((r) => String(r.id) === id);
        if (item && (item.질의요지 != null || item.회답 != null || item.이유 != null)) {
          detailRow.innerHTML =
            '<td colspan="5" class="bg-light">' +
            `<div><strong>질의요지:</strong><br>${fmt(item.질의요지)}</div><br>` +
            `<div class="mt-2"><strong>회답:</strong><br>${fmt(item.회답)}</div><br>` +
            `<div class="mt-2"><strong>이유:</strong><br>${fmt(item.이유)}</div>` +
            '</td>';
        } else {
          detailRow.innerHTML = '<td colspan="5" class="text-center text-muted">회원가입 시 본문을 조회할 수 있습니다.</td>';
        }
        detailRow.setAttribute('data-loaded', 'true');
        detailRow.classList.remove('d-none');
      });
    });
  }

  // private getVisibleResults(): SearchResult[] {
  //   return this.currentResults.slice(
  //     this.resultStartIndex, 
  //     this.resultStartIndex + this.resultPageSize
  //   );
  // }


  ///////////////////////////////////////
  // 통합 이벤트바인딩 메서드
  ///////////////////////////////////////

  // private bindEvents(): void {
  //   this.bindHeaderEvents();
  //   this.bindTextSizeEvents();
  //   this.bindSearchEvents();
  //   // 스크롤 이벤트를 여기로 이동
  //   // window.addEventListener('scroll', this.handleScroll.bind(this));    
  //   this.bindScrollEvents();
  // }

  ///////////////////////////////////////
  // 이벤트리스너 래퍼
  ///////////////////////////////////////

  // private bindHeaderEvents(): void {
  //   this.view.header.setInfoButtonHandler();
  // }

  // private bindTextSizeEvents(): void {
  //   document.querySelectorAll('input[name="textSize"]').forEach(radio => {
  //     radio.addEventListener('change', (e: Event) => this.handleTextSizeChange(e));
  //   });
  // }

  // private bindSearchEvents(): void {
  //   this.view.searchForm.setSearchHandler(() => this.performSearch());
  //   this.bindRowClickEvents();
  // }

  // private bindScrollEvents(): void {
  //   window.addEventListener('scroll', this.handleScroll.bind(this));
  // }

  // private bindRowClickEvents(): void {
  // private bindRowClickEvents(startIndex: number = 0): void {//  
    

  //   const endIndex = startIndex + this.resultPageSize;    
  //   // 범위를 사용하는 방식으로 변경
  //   const selector = startIndex > 0 ? 
  //       Array.from({length: this.resultPageSize}, (_, i) => 
  //           `.search-result-row[data-row-index="${startIndex + i}"]`
  //       ).join(', ') : 
  //       '.search-result-row';
    
  //   // console.log(`Binding click events for rows with selector: ${selector}`);
       
  //   // document.querySelectorAll('.search-result-row').forEach(row => {
  //   //   row.addEventListener('click', async (e) => {
  //   document.querySelectorAll(selector).forEach(row => {

  //   // Log to verify we found the rows
  //     // console.log(`Found row with index: ${row.getAttribute('data-row-index')}`);
    

  //     row.addEventListener('click', async (e) => {    
  //       const target = e.currentTarget as HTMLElement;
  //       const index = target.getAttribute('data-row-index');
  //       const id = target.getAttribute('data-id');
        
  //       if (!id || !index) return;
        
  //       const detailRow = document.getElementById(`detail-${index}`);
  //       if (!detailRow) return;
        
  //       // 이미 상세 정보가 로드되었는지 확인
  //       if (detailRow.getAttribute('data-loaded') === 'true') {
  //         detailRow.classList.toggle('d-none');
  //         return;
  //       }
        
  //       // 상세 정보 로드 중 표시
  //       detailRow.innerHTML = '<td colspan="5" class="text-center p-3"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div></td>';
  //       detailRow.classList.remove('d-none');
        
  //       // 상세 정보 API 호출
  //       try {
  //         const detail = await this.model.getDetail(parseInt(id, 10));
          
  //         if (detail) {
  //           detailRow.innerHTML = `
  //             <td colspan="5" class="bg-light">
  //               <div><strong>질의요지:</strong><br>${this.view.resultTable.formatMultiline(detail.질의요지)}</div>
  //               <br>
  //               <div class="mt-2"><strong>회답:</strong><br>${this.view.resultTable.formatMultiline(detail.회답)}</div>
  //               <br>
  //               <div class="mt-2"><strong>이유:</strong><br>${this.view.resultTable.formatMultiline(detail.이유)}</div>
  //             </td>
  //           `;
  //           detailRow.setAttribute('data-loaded', 'true');
  //         } else {
  //           detailRow.innerHTML = '<td colspan="5" class="text-center text-danger">상세 정보를 불러올 수 없습니다.</td>';
  //         }
  //       } catch (error) {
  //         detailRow.innerHTML = '<td colspan="5" class="text-center text-danger">상세 정보를 불러오는 중 오류가 발생했습니다.</td>';
  //         console.error('Detail loading error:', error);
  //       }
  //     });
  //   });
  // }

  ///////////////////////////////////////
  // 개별 이벤트리스너
  ///////////////////////////////////////

//   private handleTextSizeChange(e: Event): void {
//     const target = e.target as HTMLInputElement;
//     this.view.resultTable.setTextSize(target.value);
//     // this.view.render(this.currentResults);
//     // this.bindRowClickEvents();

//     // 가상화 데이터 초기화 및 다시 렌더링
//     this.resultStartIndex = 0;
//     this.visibleResults = this.getVisibleResults();
//     this.view.render(this.visibleResults);
//     this.bindRowClickEvents();   

//   }

//   private async performSearch(): Promise<void> {
//     const criteria: SearchCriteria = {
//       type: (document.getElementById('typeSelect') as HTMLSelectElement).value,
//       serial: (document.getElementById('serialInput') as HTMLInputElement).value,
//       field: (document.getElementById('fieldSelect') as HTMLSelectElement).value,
//       keyword: (document.getElementById('keywordInput') as HTMLInputElement).value
//     };

//     this.view.showLoading();
//     const results = await this.model.search(criteria);
//     this.view.hideLoading();

//     this.currentResults = results;
//     // this.view.render(results);
//     // 가상화 데이터 초기화
//     this.resultStartIndex = 0;
//     this.visibleResults = this.getVisibleResults();
//     this.view.render(this.visibleResults);    

//     const count = this.model.getLastSearchCount();
//     this.view.showToast(`검색 완료: 총 ${count}건이 조회되었습니다.`);

//     this.bindRowClickEvents();
//   }


// // 3. handleScroll에서 데이터 추가 시 콘솔 로그 추가
//   private handleScroll(): void {
//     // 이미 로딩 중이면 중복 요청 방지
//     if (this.isLoading) return;
    
//     const scrollPosition = window.scrollY;
//     const windowHeight = window.innerHeight;
//     const documentHeight = document.documentElement.scrollHeight;
    
//     // 스크롤이 페이지 하단에 가까워지고, 더 보여줄 데이터가 있을 때
//     if (scrollPosition + windowHeight > documentHeight - 300) {
//       if (this.resultStartIndex + this.resultPageSize < this.currentResults.length) {
//         // console.log("Loading more results");
        
//         this.isLoading = true;
        
//         // 다음 페이지 시작 인덱스 설정
//         this.resultStartIndex += this.resultPageSize;
        
//         // 다음 페이지 아이템 가져오기
//         const nextResults = this.getVisibleResults();
        
//         // 화면에 표시된 결과에 추가
//         this.visibleResults = [...this.visibleResults, ...nextResults];
        
//         // 새 결과를 화면에 추가
//         // this.view.appendResults(nextResults);
//         this.view.render(nextResults, true);        
        
//         // 새로 추가된 행에 이벤트 바인딩
//         this.bindRowClickEvents(this.resultStartIndex);
        
//         // 로딩 완료
//         this.isLoading = false;
//       }
//     }
//   }



//   dispose(): void {
//     // 스크롤 이벤트 핸들러 제거 - bind(this)로 바인딩된 핸들러 제거
//     window.removeEventListener('scroll', this.handleScroll.bind(this));
//   }
  
}