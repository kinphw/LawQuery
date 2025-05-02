import { ILawController } from "../LawController";

export class LawEventManager {
    private controller: ILawController;

    constructor(ILawController: ILawController) {
        this.controller = ILawController;
    }

    // 이하는 이벤트바인딩 함수

    // 이벤트바인딩 래퍼 (초기화할때만 사용)
    bindEvents(): void {
        this.bindHeaderEvents();
        this.bindTextSizeEvents();
        this.bindSearchEvents();  
        this.bindToggleButtonEvents();       
        this.bindTextSearchEvents()       
    }

    // 개별 이벤트바인딩 함수
    private bindHeaderEvents(): void {
        this.controller.view.header.setInfoButtonHandler();
    }

    private bindTextSizeEvents(): void {
        document.querySelectorAll('input[name="textSize"]').forEach(radio => {
            radio.addEventListener('change', (e: Event) => this.handleTextSizeChange(e));
        });
    }  
    private bindSearchEvents(): void {
        const searchBtn = document.getElementById('lawSearchBtn');
        if (searchBtn) {
            searchBtn.addEventListener('click', () => this.handleSearch());
        }
    } 

    private bindToggleButtonEvents(): void {
        const searchContent = document.getElementById('lawSearchContent');
        if (searchContent) {
            searchContent.addEventListener('show.bs.collapse', () => {
                document.querySelector('.floating-search-btn')?.classList.remove('d-none');
            });
            
            searchContent.addEventListener('hide.bs.collapse', () => this.handleCollapseHide());
        }
    } 

    private bindTextSearchEvents(): void {
        const searchInput = document.getElementById('lawTextSearch') as HTMLInputElement;
        const searchBtn = document.getElementById('lawTextSearchBtn');
        
        // const performTextSearch = () => {
        //     const searchText = searchInput.value;
        //     const filteredResults = this.controller.model.filterByText(searchText, this.controller.dataManager.currentResults);
        //     this.controller.view.render(filteredResults, searchText);
        //     this.controller.view.showToast('검색결과를 재조회하였습니다.');
        // };
    
        // 검색 버튼 클릭 이벤트
        searchBtn?.addEventListener('click', () => this.textSearch());
        
        // 엔터키 이벤트
        searchInput?.addEventListener('keypress', (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                e.preventDefault(); // 폼 제출 방지
                // performTextSearch();
                this.textSearch();
            }
        });
    }


    ////////////////////////////////////////////////////
    // 이하는 이벤트핸들러
    ////////////////////////////////////////////////////

    // 검색어 조회 이벤트핸들러
    private textSearch(): void {

        const searchInput = document.getElementById('lawTextSearch') as HTMLInputElement;
        const searchBtn = document.getElementById('lawTextSearchBtn');

        const searchText = searchInput.value;
        const filteredResults = this.controller.model.filterByText(searchText, this.controller.dataManager.currentResults);
        this.controller.view.render(filteredResults, searchText);
        this.controller.view.showToast('검색결과를 재조회하였습니다.');
    }

    // 조문별 조회 이벤트핸들러러
    private async handleSearch(): Promise<void> {
        const selectedLaws = Array.from(document.querySelectorAll('input[type="checkbox"]:checked'))
            .map(cb => (cb as HTMLInputElement).value)
            .filter(id => id); // Filter out null values
    
        if (selectedLaws.length) {
            const results = await this.controller.model.getLawsByIds(selectedLaws);
            this.controller.dataManager.currentResults = results;
            this.controller.view.render(results);
            this.controller.view.showToast('검색결과를 재조회하였습니다.'); // 추가  

            // 조문별 선택조회 접기 (Bootstrap 없이 직접 class 조작)
            const searchContent = document.getElementById('lawSearchContent');
            if (searchContent) {
                searchContent.classList.remove('show');
                searchContent.classList.add('collapse');
                this.handleCollapseHide(); // 재사용!
            }

            this.bindHeaderEvents();
        }
    }    

    // 재사용하기 위한 함수 : 조문별 선택조회 접기
    private handleCollapseHide(): void {
        document.querySelector('.floating-search-btn')?.classList.add('d-none');
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    }    


    // 글자크기 변경 이벤트핸들러
    private handleTextSizeChange(e: Event): void {
        const target = e.target as HTMLInputElement;
        this.controller.view.lawTable.setTextSize(target.value);
        this.controller.view.render(this.controller.dataManager.currentResults);
        // Rebind all events after re-render
        this.bindHeaderEvents();
        this.controller.view.showToast('글자크기 변경');
    }    
}
