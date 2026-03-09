import { ILawController } from "../LawController";
import { ILawEventManager } from "./ILawEventManager";

export class LawSearchEventManager implements ILawEventManager {
    constructor(private controller: ILawController) {}

    bindEvents(): void {
        this.bindSearchEvents();
        this.bindToggleButtonEvents();
    }

    private bindSearchEvents(): void {
        const searchBtn = document.getElementById('lawSearchBtn');
        if (searchBtn) {
            searchBtn.addEventListener('click', () => this.handleSearch());
        }
    }

    private bindToggleButtonEvents(): void {
        const toggleBtn = document.getElementById('lawSearchToggle');
        const searchContent = document.getElementById('lawSearchContent');
        if (toggleBtn && searchContent) {
            toggleBtn.addEventListener('click', () => {
                const isHidden = searchContent.classList.contains('d-none');
                if (isHidden) {
                    searchContent.classList.remove('d-none');
                    requestAnimationFrame(() => searchContent.classList.add('is-open'));
                    document.querySelector('.floating-search-btn')?.classList.remove('d-none');
                } else {
                    searchContent.classList.remove('is-open');
                    setTimeout(() => searchContent.classList.add('d-none'), 200);
                    this.handleCollapseHide();
                }
            });
        }
    }

    private async handleSearch(): Promise<void> {
        const selectedLaws = Array.from(document.querySelectorAll('input[type="checkbox"]:checked'))
            .map(cb => (cb as HTMLInputElement).value)
            .filter(id => id);

        if (selectedLaws.length) {
            // const results = await this.controller.model.getLawsByIds(selectedLaws);
            this.controller.dataManager.setCurrentResults(await this.controller.modelFetchById.getLawsByIds(selectedLaws));
            // this.controller.dataManager.currentResults = results;
            // await this.controller.view.render(results);
            await this.controller.view.render(this.controller.dataManager.getCurrentResults());
            this.controller.view.showToast('검색결과를 재조회하였습니다.');

            const searchContent = document.getElementById('lawSearchContent');
            if (searchContent) {
                searchContent.classList.remove('is-open');
                setTimeout(() => searchContent.classList.add('d-none'), 200);
                this.handleCollapseHide();
            }

            // this.controller.view.header.setInfoButtonHandler();
            this.controller.bindPostRenderEvents();
        }
    }

    private handleCollapseHide(): void {
        document.querySelector('.floating-search-btn')?.classList.add('d-none');
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    }
}