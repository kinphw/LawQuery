import { ILawController } from '../LawController';
import { ILawEventManager } from './ILawEventManager';
import { LawTreeNode } from '../../types/LawTreeNode';
import { countRevised, filterRevised, formatSchedDate, revisionDates } from '../../util/RevisionFilter';

/**
 * LawRevisionEventManager
 * ------------------------------------------------------------------
 * '개정비교' 모드 — 시행예정 개정이 걸린 조문만 남긴 연계표.
 *
 * 표를 새로 그리는 게 아니라 데이터만 걸러 기존 렌더 경로(view.render → LawTable)로
 * 되돌려 보낸다. 현행↔시행예정 인라인 diff(<del>/<ins>)는 LawTable 이 이미 그리므로
 * 이 매니저가 하는 일은 '어느 행을 남길지'뿐이다.
 *
 * 원본은 dataManager 에 그대로 두고 렌더만 필터본으로 바꾼다. 그래서 검색·조문별
 * 선택조회가 표를 다시 그리면 개정 필터가 자연히 풀리는데, 그때 배너·버튼만 남으면
 * 거짓말이 되므로 MutationObserver 로 외부 재렌더를 감지해 모드를 함께 해제한다.
 */
export class LawRevisionEventManager implements ILawEventManager {

    private on = false;
    private bound = false;
    private banner: HTMLElement | null = null;
    private observer: MutationObserver | null = null;
    private selfRender = false;

    constructor(private controller: ILawController) { }

    /** 버튼 1회 바인딩(bindAllEvents 가 여러 경로에서 불려도 리스너가 겹치지 않게). */
    bindEvents(): void {
        if (this.bound) return;
        this.bound = true;
        document.getElementById('lawRevisionBtn')
            ?.addEventListener('click', () => this.toggle());
    }

    private toggle(): void {
        if (this.on) this.exit(); else this.enter();
    }

    // ── 모드 진입/해제 ─────────────────────────────────────────────

    private enter(): void {
        const all = this.controller.dataManager.getCurrentResults();
        const filtered = filterRevised(all);
        const n = countRevised(all);

        if (!n || !filtered.length) {
            this.controller.view.showToast('이 법령에는 시행예정 개정사항이 없습니다');
            return;
        }

        this.on = true;
        this.setTriggerActive(true);
        this.rerender(filtered);
        this.renderBanner(n, revisionDates(all));
        this.watchExternalRender();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    /**
     * @param rerender 전체 표로 되돌릴지. 외부(검색 등)가 이미 표를 그린 뒤라면
     *                 false — 그 결과를 우리 렌더로 덮어쓰면 사용자의 검색이 날아간다.
     */
    private exit(rerender: boolean = true): void {
        if (!this.on) return;
        this.on = false;
        this.setTriggerActive(false);
        this.observer?.disconnect();
        this.observer = null;
        this.banner?.remove();
        this.banner = null;
        if (rerender) this.rerender(this.controller.dataManager.getCurrentResults());
    }

    /** 우리가 그린 렌더임을 표시한 채 재렌더(옵저버가 이걸 외부 렌더로 오인하지 않도록). */
    private rerender(nodes: LawTreeNode[]): void {
        this.selfRender = true;
        this.controller.view.render(nodes);
        this.controller.bindPostRenderEvents();
        // MutationObserver 콜백은 마이크로태스크로 뒤늦게 도착한다 → 다음 틱에 플래그 해제.
        setTimeout(() => { this.selfRender = false; }, 0);
    }

    private watchExternalRender(): void {
        const host = document.getElementById('results');
        if (!host) return;
        this.observer = new MutationObserver(() => {
            if (this.selfRender) return;
            this.exit(false); // 검색·조문별 선택조회가 표를 다시 그렸다 → 모드 표시만 정리
        });
        this.observer.observe(host, { childList: true });
    }

    private setTriggerActive(on: boolean): void {
        const btn = document.getElementById('lawRevisionBtn');
        if (!btn) return;
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-pressed', String(on));
    }

    // ── 안내 배너 ──────────────────────────────────────────────────

    private renderBanner(n: number, dates: string[]): void {
        const host = document.getElementById('results');
        if (!host || !host.parentNode) return;

        const when = dates.map(formatSchedDate).join(' · ');
        const el = document.createElement('div');
        el.className = 'container lq-rev-banner';
        el.innerHTML = `
            <div class="alert alert-warning d-flex align-items-center flex-wrap gap-2 py-2 mb-2">
                <span class="fw-bold"><i class="fas fa-code-compare"></i> 개정비교</span>
                <span class="small">개정 ${n}건만 표시 중${when ? ` · 시행 ${when}` : ''}</span>
                <span class="small text-muted lq-rev-legend">
                    <del class="law-del">삭제</del> <ins class="law-ins">신설·변경</ins>
                </span>
                <button type="button" class="btn btn-sm btn-outline-dark ms-auto" data-act="rev-off">
                    전체 보기
                </button>
            </div>`;
        host.parentNode.insertBefore(el, host);

        el.addEventListener('click', (e) => {
            if ((e.target as HTMLElement).closest('[data-act="rev-off"]')) this.exit();
        });
        this.banner = el;
    }
}
