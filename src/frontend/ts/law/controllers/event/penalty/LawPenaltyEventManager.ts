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

    // 조문별 벌칙 버튼 이벤트 바인딩
    private bindArticlePenaltyButtons(): void {
        const buttons = document.querySelectorAll('.law-penalty-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id_a = (e.currentTarget as HTMLElement).getAttribute('data-id_a');
                if (!id_a) return;
                
                // 처리 로직을 PenaltyButtonHandler로 위임
                await this.buttonHandler.handleArticlePenaltyClick(id_a);
            });
        });
    }

}