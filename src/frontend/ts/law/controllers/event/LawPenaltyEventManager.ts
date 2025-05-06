import { ILawController } from "../LawController";
import { ILawEventManager } from "./ILawEventManager";
import { LawPenalty } from "../../types/LawPenalty";

export class LawPenaltyEventManager implements ILawEventManager {
    constructor(private controller: ILawController) {}

    // bindEvents(): void {
    //     const penaltyBtn = document.getElementById('penaltyBtn');
    //     if (penaltyBtn) {
    //         penaltyBtn.addEventListener('click', () => this.handlePenaltyClick());
    //     }

    //     // 새로 추가: 각 조문별 벌칙 버튼 이벤트
    //     document.querySelectorAll('.law-penalty-btn').forEach(btn => {
    //         btn.addEventListener('click', async (e) => {
    //             const id_a = (e.currentTarget as HTMLElement).getAttribute('data-id_a');
    //             if (!id_a) return;
    //             try {
    //                 // id_a로 벌칙 정보 요청
    //                 const penalties = await this.controller.modelFetchPenalty.getPenalties([id_a]);
    //                 const tableHtml = this.controller.viewPenalty.renderTable(penalties);
    //                 this.showPenaltyModal(tableHtml);

    //                 // 모달 내 원문(법) 버튼 이벤트 바인딩
    //                 setTimeout(() => {
    //                     document.querySelectorAll('.law-origin-btn').forEach(btn => {
    //                         btn.addEventListener('click', (e) => {
    //                             const idx = Number((e.currentTarget as HTMLElement).getAttribute('data-index'));
    //                             const content = penalties[idx]?.content_a ?? '';
    //                             this.showOriginLawModal(content);
    //                         });
    //                     });
    //                 }, 0);
    //             } catch (err) {
    //                 this.controller.view.showToast('벌칙 정보를 불러오는 데 실패했습니다.');
    //             }
    //         });
    //     });
    // }

    bindEvents(): void { // private method 2개로 분리
        this.bindTotalPenaltyButton();
        this.bindArticlePenaltyButtons();
    }

    // 전체 벌칙 버튼 이벤트 바인딩
    private bindTotalPenaltyButton(): void {
        const penaltyBtn = document.getElementById('penaltyBtn');
        if (penaltyBtn) {
            penaltyBtn.addEventListener('click', () => this.handlePenaltyClick());
        }
    }

    // 조문별 벌칙 버튼 이벤트 바인딩
    public bindArticlePenaltyButtons(): void {
        const buttons = document.querySelectorAll('.law-penalty-btn');
        console.log('[LawPenaltyEventManager] 조문별 벌칙 버튼 바인딩:', buttons.length, '개');
        buttons.forEach(btn => {

            // // 기존 이벤트 제거를 위해 노드를 복제해서 교체
            // const newBtn = btn.cloneNode(true) as HTMLElement;
            // btn.parentNode?.replaceChild(newBtn, btn);            

            const id_a = (btn as HTMLElement).getAttribute('data-id_a');
            console.log('[LawPenaltyEventManager] 바인딩 시점 id_a:', id_a);

        // document.querySelectorAll('.law-penalty-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id_a = (e.currentTarget as HTMLElement).getAttribute('data-id_a');
                if (!id_a) return;
                try {
                    const penalties = await this.controller.modelFetchPenalty.getPenalties([id_a]);
                    const tableHtml = this.controller.viewPenalty.renderTable(penalties);
                    this.showPenaltyModal(tableHtml);

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
            });
        });
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