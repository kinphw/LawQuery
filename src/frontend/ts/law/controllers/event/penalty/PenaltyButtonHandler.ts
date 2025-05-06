import { ILawController } from "../../LawController";
import { LawPenalty } from "../../../types/LawPenalty";
import { PenaltyModalManager } from "./PenaltyModalManager";

export class PenaltyButtonHandler {
    constructor(
        private controller: ILawController,
        private modalManager: PenaltyModalManager
    ) {} 


    bindOriginLawButtons(penalties: LawPenalty[]): void {
        setTimeout(() => {
            document.querySelectorAll('.law-origin-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const idx = Number((e.currentTarget as HTMLElement).getAttribute('data-index'));
                    const content = penalties[idx]?.content_a ?? '';
                    this.modalManager.showOriginLawModal(content);
                });
            });
        }, 0);
    }    


    // 정렬 버튼 이벤트 바인딩 (신규 메서드)
    bindSortButtons(penalties: LawPenalty[]): void {
        // 벌칙순 버튼
        const sortByPenaltyBtn = document.getElementById('sortByPenalty');
        if (sortByPenaltyBtn) {
            sortByPenaltyBtn.addEventListener('click', async () => {
                // 벌칙순으로 데이터 다시 불러오기
                const penalties = await this.controller.modelFetchPenalty.getPenalty(undefined, 'penalty');
                const tableHtml = this.controller.viewPenalty.renderTable(penalties, true);
                
                // 1. 모달 내용 교체
                document.querySelector('#penaltyModal .modal-body')!.innerHTML = tableHtml;
                
                // 2. 새로 생성된 버튼에 active 클래스 적용 (DOM 업데이트 후)
                setTimeout(() => {
                    document.getElementById('sortByPenalty')?.classList.add('active');
                    document.getElementById('sortByCause')?.classList.remove('active');
                    
                    // 3. 원조문 버튼 및 정렬 버튼 재바인딩
                    this.bindOriginLawButtons(penalties);
                    this.bindSortButtons(penalties);
                }, 0);
            });
        }
    
        // 원인순 버튼
        const sortByCauseBtn = document.getElementById('sortByCause');
        if (sortByCauseBtn) {
            sortByCauseBtn.addEventListener('click', async () => {
                // 원인순으로 데이터 다시 불러오기
                const penalties = await this.controller.modelFetchPenalty.getPenalty(undefined, 'cause');
                const tableHtml = this.controller.viewPenalty.renderTable(penalties, true);
                
                // 1. 모달 내용 교체
                document.querySelector('#penaltyModal .modal-body')!.innerHTML = tableHtml;
                
                // 2. 새로 생성된 버튼에 active 클래스 적용 (DOM 업데이트 후)
                setTimeout(() => {
                    document.getElementById('sortByCause')?.classList.add('active');
                    document.getElementById('sortByPenalty')?.classList.remove('active');
                    
                    // 3. 원조문 버튼 및 정렬 버튼 재바인딩
                    this.bindOriginLawButtons(penalties);
                    this.bindSortButtons(penalties);
                }, 0);
            });
        }
    }    

    // 원조문 버튼 이벤트 바인딩 (공통화)

    async handlePenaltyClick(): Promise<void> {
        try {
            // 기본값은 벌칙순(penalty)으로 데이터 불러오기
            const penalties: LawPenalty[] = await this.controller.modelFetchPenalty.getPenalty(undefined, 'penalty');
            const tableHtml = this.controller.viewPenalty.renderTable(penalties, true);
            this.modalManager.showPenaltyModal(tableHtml);
            
            // 원조문 버튼 이벤트 바인딩
            this.bindOriginLawButtons(penalties);
            
            // 정렬 버튼 이벤트 바인딩 (추가)
            this.bindSortButtons(penalties);
            
            // 초기 상태에서 벌칙순 버튼 활성화
            document.getElementById('sortByPenalty')?.classList.add('active');
            
        } catch (err) {
            this.controller.view.showToast('벌칙 정보를 불러오는 데 실패했습니다.');
        }
    }    

    /**
     * 조문별 벌칙 클릭 이벤트 처리
     * @param id_a 조문 ID
     */
    async handleArticlePenaltyClick(id_a: string): Promise<void> {
        try {
            // 벌칙 데이터 조회
            const penalties = await this.controller.modelFetchPenalty.getPenalty([id_a]);
            
            // 테이블 HTML 생성 (조문별 조회는 isFullView = false)
            const tableHtml = this.controller.viewPenalty.renderTable(penalties, false);
            
            // 모달 표시
            this.modalManager.showPenaltyModal(tableHtml);

            // 원조문 버튼 이벤트 바인딩
            this.bindOriginLawButtons(penalties);
        } catch (err) {
            this.controller.view.showToast('벌칙 정보를 불러오는 데 실패했습니다.');
        }
    }    

}


