import { ILawController } from "../../LawController";
import { LawPenalty } from "../../../types/LawPenalty";
import { PenaltyModalManager } from "./PenaltyModalManager";
import { LawFetchArticleModel } from "../../../models/LawFetchArticleModel";

export class PenaltyButtonHandler {
    private articleModel = new LawFetchArticleModel();
    constructor(
        private controller: ILawController,
        private modalManager: PenaltyModalManager
    ) {}


    bindOriginLawButtons(penalties: LawPenalty[]): void {
        setTimeout(() => {
            document.querySelectorAll('.law-origin-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const idx = Number((e.currentTarget as HTMLElement).getAttribute('data-index'));
                    const p = penalties[idx];
                    const content = p?.content_a ?? '';
                    // 위반조가 위임한 하위(시행령 등)도 함께 — '진짜 원인규정'까지 한 팝업에
                    const { chain, highlights } = p?.id_a
                        ? await this.articleModel.getDelegationChain(p.id_a)
                        : { chain: [], highlights: [] };
                    const focus = this.followFocus(p, highlights);   // {조ID: 강조 단위번호}
                    this.modalManager.showOriginLawModal(content, p?.id_a ?? '', chain, focus);
                });
            });
        }, 0);
    }

    /** 위반 호에서 출발, 강조쌍을 따라가며 각 조의 강조 단위번호(항/호) 수집. */
    private followFocus(p: LawPenalty, highlights: Array<{ up: string; down: string }>): Record<string, number> {
        const res: Record<string, number> = {};
        if (!p?.id_a) return res;
        const jo = (s: string) => s.replace(/_\d+h.*$/, '');
        const numOf = (s: string) => { const m = s.match(/_(\d+)h(?:_\d+(?:_\d+)?ho)?$/); return m ? parseInt(m[1]) : null; };
        const jm = p.id_a.match(/^A(\d+)(?:_(\d+))?/);
        const hm = jm ? (p.content_pa || '').match(new RegExp(`제${jm[1]}조${jm[2] ? '의' + jm[2] : ''}제(\\d+)호`)) : null;
        if (!hm) return res;                                // 위반 호를 못 찾으면 강조 없음(전체 표시)
        res[p.id_a] = parseInt(hm[1]);
        let cur = highlights.find(h => jo(h.up) === p.id_a && numOf(h.up) === res[p.id_a]);
        const seen = new Set<string>();
        while (cur && !seen.has(cur.down)) {
            seen.add(cur.down);
            const dn = numOf(cur.down);
            if (dn != null) res[jo(cur.down)] = dn;
            cur = highlights.find(h => h.up === cur!.down);
        }
        return res;
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


