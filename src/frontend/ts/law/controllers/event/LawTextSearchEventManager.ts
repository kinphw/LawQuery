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
        const filteredResults = this.controller.model.filterByText(searchText, this.controller.dataManager.currentResults);
        await this.controller.view.render(filteredResults, searchText);
        this.controller.view.header.setInfoButtonHandler();
        this.controller.view.showToast('검색결과를 재조회하였습니다.');
    }
}