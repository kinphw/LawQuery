import { ILawController } from "../../LawController";
import { ILawEventManager } from "../ILawEventManager";
import { AnnexButtonHandler } from "./AnnexButtonHandler";
import { AnnexModalManager } from "./AnnexModalManager";
import { AnnexPopupManager } from "./AnnexPopupManager";
import { ArticlePopupManager } from "./ArticlePopupManager";

export class LawAnnexEventManager implements ILawEventManager {
    private modalManager: AnnexModalManager;
    private popupManager: AnnexPopupManager;
    private articlePopupManager: ArticlePopupManager;
    private buttonHandler: AnnexButtonHandler;

    constructor(private controller: ILawController) {
        this.modalManager = new AnnexModalManager();
        this.popupManager = new AnnexPopupManager();
        this.articlePopupManager = new ArticlePopupManager();
        this.buttonHandler = new AnnexButtonHandler(controller, this.modalManager, this.popupManager);
    }

    public bindEvents(): void {
        this.bindTotalAnnexButton();
        this.bindArticleAnnexButtons();
        this.bindViewerButtons();
    }

    public bindArticleEvents(): void {
        this.bindArticleAnnexButtons();
    }

    private bindTotalAnnexButton(): void {
        const annexBtn = document.getElementById('annexBtn');
        if (annexBtn) {
            annexBtn.addEventListener('click', () => this.buttonHandler.handleAnnexClick());
        }
    }

    private bindArticleAnnexButtons(): void {
        const buttons = document.querySelectorAll('.law-annex-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const mouseEvent = e as MouseEvent;
                const id_src = (e.currentTarget as HTMLElement).getAttribute('data-id_src');
                if (!id_src) return;

                await this.buttonHandler.handleArticleAnnexClick(id_src, mouseEvent.clientX, mouseEvent.clientY);
            });
        });
    }

    private bindViewerButtons(): void {
        document.addEventListener('click', async (e) => {
            const target = e.target as HTMLElement;

            // 1. 별표 문서 보기 (iframe 모달)
            const annexViewerBtn = target.closest('.law-annex-viewer-btn');
            if (annexViewerBtn) {
                const url = annexViewerBtn.getAttribute('data-url');
                const title = annexViewerBtn.getAttribute('data-title');
                if (url) {
                    this.popupManager.closePopup(); // 모달 띄우기 직전에 열려있는 인라인 팝업을 닫음
                    this.articlePopupManager.closePopup(); // 혹시 열려있을 조문 팝업도 닫음
                    this.modalManager.showAnnexViewerModal(url, title ?? undefined);
                }
                return;
            }

            // 2. 조문 내용 팝업 (원조문 모달 -> 인라인 팝업)
            const srcArticleBtn = target.closest('.view-src-article-btn');
            if (srcArticleBtn) {
                const origin = srcArticleBtn.getAttribute('data-origin');
                const id_src = srcArticleBtn.getAttribute('data-id_src');

                if (origin && id_src) {
                    try {
                        const article = await this.controller.modelFetchArticle.getArticle(origin, id_src);
                        if (article) {
                            const formattedContent = `<div class="p-2" style="font-size: 0.9em;">${article.content}</div>`;
                            // Show popup near the mouse click
                            this.articlePopupManager.showPopup('관련 조문 내용', formattedContent, e.clientX + 10, e.clientY + 10);
                        } else {
                            this.controller.view.showToast('해당 조문 내용을 찾을 수 없습니다.');
                        }
                    } catch (err) {
                        this.controller.view.showToast('조문 조회에 실패했습니다.');
                    }
                }
                return;
            }
        });
    }
}
