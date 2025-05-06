import { ILawController } from "../../LawController";

export class PenaltyModalManager {
    constructor(private controller: ILawController) {}

    showPenaltyModal(tableHtml: string): void {
        const modal = document.getElementById('penaltyModal');
        if (modal) {
            modal.querySelector('.modal-title')!.textContent = '벌칙 정보';
            modal.querySelector('.modal-body')!.innerHTML = tableHtml;
            // @ts-ignore
            const bsModal = new bootstrap.Modal(modal);
            bsModal.show();
        }
    }

    showOriginLawModal(content: string) {
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