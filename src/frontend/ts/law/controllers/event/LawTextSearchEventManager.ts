import { ILawController } from "../LawController";
import { ILawEventManager } from "./ILawEventManager";

export class LawTextSearchEventManager implements ILawEventManager {
    constructor(private controller: ILawController) {}

    bindEvents(): void {
        this.bindTextSearchEvents();
    }

    private bindTextSearchEvents(): void {
        const searchInput = document.getElementById('lawTextSearch') as HTMLInputElement;
        const searchBtn = document.getElementById('lawTextSearchBtn');

        searchBtn?.addEventListener('click', () => this.textSearch());
        searchInput?.addEventListener('keypress', (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.textSearch();
            }
        });
    }

    private async textSearch(): Promise<void> {
        const searchInput = document.getElementById('lawTextSearch') as HTMLInputElement;
        const searchText = searchInput.value;
        const filteredResults = this.controller.modelTextFilter.filterByText(searchText,
            // this.controller.dataManager.currentResults);
            this.controller.dataManager.getCurrentResults()
        );
        // 검색어로 조회하면 currentResults를 업데이트 : 추가로직으로 넣을까 하다가 안함
        // 왜냐면 일단 조문별조회 => 글자조회를 할때 여러번 재시도할 수 있으니까.
        // this.controller.dataManager.setCurrentResults(filteredResults);

        await this.controller.view.render(filteredResults, searchText);
        this.controller.view.header.setInfoButtonHandler();
        this.controller.view.showToast('검색결과를 재조회하였습니다.');
    }
}