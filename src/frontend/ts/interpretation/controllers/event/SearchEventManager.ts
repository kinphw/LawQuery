import { ISearchController } from "../SearchController";

import { SearchCriteria } from "../../types/SearchCriteria";
import { SearchResult } from "../../types/SearchResult";
import { SearchDataManager } from "../data/SearchDataManager";

export class SearchEventManager {

    private controller: ISearchController;

    private isLoading = false; // 로딩 중복 방지 플래그 추가

    constructor(controller: ISearchController) {
        this.controller = controller; // SearchController 인스턴스를 저장
    }    

    bindEvents(): void {
        this.bindHeaderEvents();
        this.bindTextSizeEvents();
        this.bindSearchEvents();
        this.bindCopyAllEvents();
        // 스크롤 이벤트를 여기로 이동
        // window.addEventListener('scroll', this.handleScroll.bind(this));
        this.bindScrollEvents();
    }
    
    ///////////////////////////////////////
    // 이벤트리스너 래퍼
    ///////////////////////////////////////

    private bindHeaderEvents(): void {
        this.controller.view.header.setInfoButtonHandler();
    }

    private bindTextSizeEvents(): void {
        document.querySelectorAll('input[name="textSize"]').forEach(radio => {
        radio.addEventListener('change', (e: Event) => this.handleTextSizeChange(e));
        });
    }

    private bindSearchEvents(): void {
        this.controller.view.searchForm.setSearchHandler(() => this.performSearch());
        this.bindRowClickEvents();
    }

    private bindScrollEvents(): void {
        window.addEventListener('scroll', this.handleScroll.bind(this));
    }

    private bindCopyAllEvents(): void {
        this.controller.view.searchForm.setCopyAllHandler(() => this.copyAllResults());
    }

    private async copyAllResults(): Promise<void> {
        const data = this.controller.dataManager.currentResults;
        if (!data.length) {
            this.controller.view.showToast('복사할 결과가 없습니다.');
            return;
        }

        const btn = document.getElementById('copyAllBtn') as HTMLButtonElement | null;
        const originalText = btn?.textContent || '전체 복사';
        if (btn) {
            btn.disabled = true;
            btn.textContent = `복사 중... 0/${data.length}`;
        }

        const details: Array<{ 질의요지: string; 회답: string; 이유: string; } | null> = new Array(data.length);
        let cursor = 0;
        const worker = async () => {
            while (cursor < data.length) {
                const i = cursor++;
                details[i] = await this.controller.model.getDetail(data[i].id);
                if (btn && (i + 1) % 5 === 0) {
                    btn.textContent = `복사 중... ${i + 1}/${data.length}`;
                }
            }
        };
        await Promise.all(Array.from({ length: 5 }, worker));

        const sep = '\n' + '='.repeat(80) + '\n';
        const text = data.map((item, i) => {
            const d = details[i] || { 질의요지: '', 회답: '', 이유: '' };
            const date = (item.회신일자 || '').toString().slice(0, 10);
            return [
                `[${i + 1}/${data.length}] ${item.구분 || ''} | ${item.분야 || ''} | ${item.일련번호 || ''} | ${date}`,
                `제목: ${item.제목 || ''}`,
                ``,
                `■ 질의요지`, d.질의요지 || '',
                ``,
                `■ 회답`, d.회답 || '',
                ``,
                `■ 이유`, d.이유 || '',
            ].join('\n');
        }).join(sep);

        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();

        if (btn) {
            btn.disabled = false;
            btn.textContent = originalText;
        }

        this.controller.view.showToast(
            ok
                ? `클립보드 복사 완료 (${data.length}건, ${text.length.toLocaleString()}자)`
                : '복사 실패'
        );
    }
    // 
    private bindRowClickEvents(startIndex: number = 0): void {//  
    

        const endIndex = startIndex + this.controller.dataManager.resultPageSize;    
        // 범위를 사용하는 방식으로 변경
        const selector = startIndex > 0 ? 
            Array.from({length: this.controller.dataManager.resultPageSize}, (_, i) => 
                `.search-result-row[data-row-index="${startIndex + i}"]`
            ).join(', ') : 
            '.search-result-row';
        
        // console.log(`Binding click events for rows with selector: ${selector}`);
           
        // document.querySelectorAll('.search-result-row').forEach(row => {
        //   row.addEventListener('click', async (e) => {
        document.querySelectorAll(selector).forEach(row => {
    
        // Log to verify we found the rows
          // console.log(`Found row with index: ${row.getAttribute('data-row-index')}`);
        
    
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
              const detail = await this.controller.model.getDetail(parseInt(id, 10));
              
              if (detail) {
                detailRow.innerHTML = `
                  <td colspan="5" class="bg-light">
                    <div><strong>질의요지:</strong><br>${this.controller.view.resultTable.formatMultiline(detail.질의요지)}</div>
                    <br>
                    <div class="mt-2"><strong>회답:</strong><br>${this.controller.view.resultTable.formatMultiline(detail.회답)}</div>
                    <br>
                    <div class="mt-2"><strong>이유:</strong><br>${this.controller.view.resultTable.formatMultiline(detail.이유)}</div>
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

    ///////////////////////////////////////
    // 개별 이벤트리스너
    ///////////////////////////////////////

    private handleTextSizeChange(e: Event): void {
        const target = e.target as HTMLInputElement;
        this.controller.view.resultTable.setTextSize(target.value);
        // this.view.render(this.currentResults);
        // this.bindRowClickEvents();

        // 가상화 데이터 초기화 및 다시 렌더링
        this.controller.dataManager.resultStartIndex = 0;
        this.controller.dataManager.visibleResults = this.controller.dataManager.getVisibleResults();
        this.controller.view.render(this.controller.dataManager.visibleResults);
        this.bindRowClickEvents();   

    }

    private async performSearch(): Promise<void> {
        const criteria: SearchCriteria = {
          type: (document.getElementById('typeSelect') as HTMLSelectElement).value,
          serial: (document.getElementById('serialInput') as HTMLInputElement).value,
          field: (document.getElementById('fieldSelect') as HTMLSelectElement).value,
          keyword: (document.getElementById('keywordInput') as HTMLInputElement).value,
          startDate: (document.getElementById('startDateInput') as HTMLInputElement).value,
          endDate: (document.getElementById('endDateInput') as HTMLInputElement).value          
        };

        this.controller.view.showLoading();
        const results = await this.controller.model.search(criteria);
        this.controller.view.hideLoading();

        this.controller.dataManager.currentResults = results;
        // this.view.render(results);
        // 가상화 데이터 초기화
        this.controller.dataManager.resultStartIndex = 0;
        // this.visibleResults = this.getVisibleResults();
        // this.view.render(this.visibleResults);    
        this.controller.dataManager.setVisibleResults();
        this.controller.view.render(this.controller.dataManager.getVisibleResults());    

        const count = this.controller.model.getLastSearchCount();
        this.controller.view.showToast(`검색 완료: 총 ${count}건이 조회되었습니다.`);

        this.bindRowClickEvents();
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
            // if (this.controller.dataManager.resultStartIndex + this.controller.dataManager.resultPageSize < this.controller.dataManager.currentResults.length) {
            if (this.controller.dataManager.hasMoreData()) {                
                
                this.isLoading = true;
                
                // DataManager에 다음 페이지 로드 위임
                const nextResults = this.controller.dataManager.loadNextPage();                

                // 새 결과를 화면에 추가
                this.controller.view.render(nextResults, true);        
                
                // 새로 추가된 행에 이벤트 바인딩
                this.bindRowClickEvents(this.controller.dataManager.getResultStartIndex());                
                
                // 로딩 완료
                this.isLoading = false;

                this.controller.view.showToast(`+ ${nextResults.length} Loaded (${this.controller.dataManager.getVisibleResultsCount()}/${this.controller.dataManager.currentResults.length})`);
            }
        }
    }



    dispose(): void {
        // 스크롤 이벤트 핸들러 제거 - bind(this)로 바인딩된 핸들러 제거
        window.removeEventListener('scroll', this.handleScroll.bind(this));
    }    
    

}