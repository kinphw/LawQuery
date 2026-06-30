import { ILawController } from "../../LawController";
import { ILawEventManager } from "../ILawEventManager";
import { LawPenalty } from "../../../types/LawPenalty";

import { PenaltyButtonHandler } from "./PenaltyButtonHandler";
import { PenaltyModalManager } from "./PenaltyModalManager";


export class LawPenaltyEventManager implements ILawEventManager {
    private modalManager: PenaltyModalManager;
    private buttonHandler: PenaltyButtonHandler;

    constructor(private controller: ILawController) {
        this.modalManager = new PenaltyModalManager(controller);
        this.buttonHandler = new PenaltyButtonHandler(controller, this.modalManager);
    }

    // Public 메서드로 외부에서 호출할 수 있도록 설정
    public bindEvents(): void {
        this.bindTotalPenaltyButton();
        this.bindArticlePenaltyButtons();
    }

    public bindArticleEvents(): void {
        // 조문별 벌칙 버튼 이벤트 바인딩
        this.bindArticlePenaltyButtons();
    }

    ////////////////////////////////////////

    // 전체 벌칙 버튼 이벤트 바인딩
    private bindTotalPenaltyButton(): void {
        const penaltyBtn = document.getElementById('penaltyBtn');
        if (penaltyBtn) {
            penaltyBtn.addEventListener('click', () => this.buttonHandler.handlePenaltyClick());
        }
    }

    // 조문별 벌칙 버튼 — #results 위임(한 번만). 지연 렌더(가상화)된 버튼도 동작, 재렌더에도 생존.
    private articleDelegated = false;
    private bindArticlePenaltyButtons(): void {
        if (this.articleDelegated) return;
        const host = document.getElementById('results');
        if (!host) return;
        this.articleDelegated = true;
        host.addEventListener('click', async (e) => {
            const btn = (e.target as HTMLElement).closest('.law-penalty-btn');
            if (!btn) return;
            const id_a = btn.getAttribute('data-id_a');
            if (!id_a) return;
            await this.buttonHandler.handleArticlePenaltyClick(id_a);
        });
    }

}