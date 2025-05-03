import { ILawController } from "../LawController";
import { ILawEventManager } from "./ILawEventManager";
import { LawPenalty } from "../../types/LawPenalty";

export class LawPenaltyEventManager implements ILawEventManager {
    constructor(private controller: ILawController) {}

    bindEvents(): void {
        const penaltyBtn = document.getElementById('penaltyBtn');
        if (penaltyBtn) {
            penaltyBtn.addEventListener('click', () => this.handlePenaltyClick());
        }
    }

    private async handlePenaltyClick(): Promise<void> {
        try {
            const penalties: LawPenalty[] = await this.controller.modelFetchPenalty.getPenalties();
            const tableHtml = this.controller.viewPenalty.renderTable(penalties);
            this.showPenaltyModal(tableHtml);
    
            // 팝업 이벤트 바인딩
            setTimeout(() => {
                document.querySelectorAll('.law-origin-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const idx = Number((e.currentTarget as HTMLElement).getAttribute('data-index'));
                        const content = penalties[idx]?.content_a ?? '';
                        this.showOriginLawModal(content);
                    });
                });
            }, 0);
        } catch (err) {
            this.controller.view.showToast('벌칙 정보를 불러오는 데 실패했습니다.');
        }
    }

    private showPenaltyModal(tableHtml: string): void {
        const modal = document.getElementById('penaltyModal');
        if (modal) {
            modal.querySelector('.modal-title')!.textContent = '벌칙 정보';
            modal.querySelector('.modal-body')!.innerHTML = tableHtml;
            // @ts-ignore
            const bsModal = new bootstrap.Modal(modal);
            bsModal.show();
        }
    }
    
    // 원조문(법) 전용 모달 표시
    private showOriginLawModal(content: string) {
        const modal = document.getElementById('originLawModal');
        if (modal) {
            modal.querySelector('.modal-title')!.textContent = '원문(법) 전체 보기';
            modal.querySelector('.modal-body')!.innerHTML = `
                        <pre class="small" style="
                white-space:pre-wrap;
                font-family: 'Noto Sans KR', 'Noto Sans', 'Malgun Gothic', 'Apple SD Gothic Neo', Arial, 'Segoe UI', 'Liberation Sans', 'Consolas', 'Menlo', 'Monaco', 'Liberation Mono', 'Courier New', monospace;                
                line-height:1.7;
                letter-spacing:0.01em;
            ">
${content}
            </pre>`;
            // @ts-ignore
            const bsModal = new bootstrap.Modal(modal);
            bsModal.show();
        } else {
            alert(content);
        }
    }

}