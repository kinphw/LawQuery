import { ILawController } from "../LawController";
import { ILawEventManager } from "./ILawEventManager";

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
            // API 호출
            const response = await fetch('/api/law/penalty');
            if (!response.ok) throw new Error('벌칙 데이터를 불러오지 못했습니다.');
            const penalties = await response.json();

            // 결과를 모달로 렌더링
            this.showPenaltyModal(penalties);
        } catch (err) {
            this.controller.view.showToast('벌칙 정보를 불러오는 데 실패했습니다.');
        }
    }

    private showPenaltyModal(penalties: any[]): void {
        // 간단한 테이블 렌더링 예시 (실제 컬럼은 추후 타입 정의 후 수정)
        const tableHtml = `
            <table class="table table-bordered table-sm">
                <thead>
                    <tr>
                        <th>구분</th>
                        <th>조문</th>
                        <th>내용</th>
                        <th>벌칙</th>
                        <th>영문</th>
                    </tr>
                </thead>
                <tbody>
                    ${penalties.map(p => `
                        <tr>
                            <td>${p.category ?? ''}</td>
                            <td>${p.item_a_log ?? ''}</td>
                            <td>${p.content_a ?? ''}</td>
                            <td>${p.penalty_a_log ?? ''}</td>
                            <td>${p.content_e ?? ''}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        // Bootstrap Modal에 삽입
        const modal = document.getElementById('commonModal');
        if (modal) {
            modal.querySelector('.modal-title')!.textContent = '벌칙 정보';
            modal.querySelector('.modal-body')!.innerHTML = tableHtml;
            // @ts-ignore
            const bsModal = new bootstrap.Modal(modal);
            bsModal.show();
        }
    }
}