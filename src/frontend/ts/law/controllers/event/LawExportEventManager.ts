import { ILawController } from "../LawController";
import { ILawEventManager } from "./ILawEventManager";
import { exportViewAsHtml } from "../../../common/util/StaticHtmlExporter";

/**
 * LawExportEventManager
 * ------------------------------------------------------------------
 * 연계표에서 '필요한 조만 골라' 정적 HTML 파일로 저장한다(보고서·회신 첨부용).
 *
 * 선택 단위 = 조 밴드(tbody.lq-vblock). 5단표는 rowspan 으로 병합돼 있어 개별 tr 을 빼내면
 * 상위 셀의 병합 범위가 깨지는데, 밴드는 통째로 지우면 되므로 표가 원형 그대로 보존된다.
 * (밴드 하나 = 기준 단의 한 조 + 그 조에 딸린 하위규정 전부 = 사용자가 '이 조문' 이라고 부르는 덩어리)
 *
 * 조작은 '선택모드' 토글. 평소 조회 화면에는 체크박스를 두지 않고, 저장 버튼을 누른 동안만
 * 표를 클릭해 켜고 끈다. 선택모드에서는 셀 안 기능버튼(벌칙·별표·참조)을 CSS 로 죽여
 * (pointer-events:none) 클릭이 모달이 아니라 밴드 선택으로 흐르게 한다.
 */

/** 저장본 사본에서 통째로 걷어낼 요소 — 정적 문서에서 뜻이 없는 팝업 컨테이너·가입 안내. */
const LAW_EXPORT_REMOVE = ['.law-ref-popup', '.lq-upsell'];

export class LawExportEventManager implements ILawEventManager {

    private picking = false;
    private bar: HTMLElement | null = null;
    private onResultsClick: ((e: MouseEvent) => void) | null = null;
    private onKeydown: ((e: KeyboardEvent) => void) | null = null;
    private observer: MutationObserver | null = null;
    private bound = false;

    constructor(private controller: ILawController) { }

    /** 저장 버튼 1회 바인딩(bindAllEvents 가 여러 경로에서 불려도 리스너가 겹치지 않게). */
    bindEvents(): void {
        if (this.bound) return;
        this.bound = true;
        document.getElementById('lawExportBtn')
            ?.addEventListener('click', () => this.toggleMode());
    }

    // ── 선택모드 ───────────────────────────────────────────────────

    private toggleMode(): void {
        if (this.picking) this.exitMode(); else this.enterMode();
    }

    private enterMode(): void {
        const host = document.getElementById('results');
        if (!host) return;
        this.picking = true;
        host.classList.add('lq-pick');
        this.setTriggerActive(true);

        // 표 클릭 → 밴드 토글. #results 요소 자체에 위임하므로 재렌더(innerHTML 교체)에도 살아남는다.
        this.onResultsClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement | null;
            if (!target || target.closest('a, button, input, label')) return; // 링크·잔여 컨트롤은 그대로
            const band = target.closest('tbody.lq-vblock') as HTMLElement | null;
            if (!band) return;
            e.preventDefault();
            band.classList.toggle('lq-picked');
            this.updateBar();
        };
        host.addEventListener('click', this.onResultsClick);

        // Esc 로 빠져나가기(선택은 버림) — 모드에 갇힌 느낌 방지.
        this.onKeydown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && this.picking) { e.preventDefault(); this.exitMode(); }
        };
        document.addEventListener('keydown', this.onKeydown);

        // 글자검색·조문별 선택조회로 표가 다시 그려지면 선택이 사라진다 → 카운트를 즉시 맞춘다.
        this.observer = new MutationObserver(() => this.updateBar());
        this.observer.observe(host, { childList: true });

        this.renderBar();
        this.updateBar();
        // 좁은 화면에선 조작 바의 안내문이 숨겨지므로(개수·버튼만 남음) 토스트로 한 번 알린다.
        this.controller.view.showToast('저장할 조를 표에서 클릭해 선택하세요');
    }

    private exitMode(): void {
        const host = document.getElementById('results');
        this.picking = false;
        this.setTriggerActive(false);
        if (host) {
            host.classList.remove('lq-pick');
            host.querySelectorAll('tbody.lq-picked').forEach(el => el.classList.remove('lq-picked'));
            if (this.onResultsClick) host.removeEventListener('click', this.onResultsClick);
        }
        this.onResultsClick = null;
        if (this.onKeydown) document.removeEventListener('keydown', this.onKeydown);
        this.onKeydown = null;
        this.observer?.disconnect();
        this.observer = null;
        this.bar?.remove();
        this.bar = null;
    }

    /** 저장 버튼을 눌린 상태로 — 지금이 선택모드임을 버튼에서도 알 수 있게. */
    private setTriggerActive(on: boolean): void {
        const btn = document.getElementById('lawExportBtn');
        if (!btn) return;
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-pressed', String(on));
    }

    // ── 하단 조작 바 ───────────────────────────────────────────────

    private renderBar(): void {
        const bar = document.createElement('div');
        bar.className = 'lq-pick-bar';
        bar.innerHTML = `
            <div class="lq-pick-bar-inner container">
                <span class="lq-pick-msg small text-muted">
                    저장할 조를 표에서 클릭하세요 (한 번 더 클릭하면 해제)
                </span>
                <span class="badge bg-primary lq-pick-count">0개 선택</span>
                <div class="lq-pick-acts">
                    <button type="button" class="btn btn-sm btn-outline-secondary" data-act="all">전체 선택</button>
                    <button type="button" class="btn btn-sm btn-outline-secondary" data-act="none">선택 해제</button>
                    <button type="button" class="btn btn-sm btn-primary" data-act="save" disabled>
                        <i class="fas fa-download"></i> HTML 저장
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-dark" data-act="cancel">닫기</button>
                </div>
            </div>`;
        document.body.appendChild(bar);
        this.bar = bar;

        bar.addEventListener('click', (e) => {
            const act = (e.target as HTMLElement).closest('[data-act]')?.getAttribute('data-act');
            if (act === 'all') this.selectAll(true);
            else if (act === 'none') this.selectAll(false);
            else if (act === 'save') void this.save();
            else if (act === 'cancel') this.exitMode();
        });
    }

    private selectAll(on: boolean): void {
        document.getElementById('results')
            ?.querySelectorAll('tbody.lq-vblock')
            .forEach(el => el.classList.toggle('lq-picked', on));
        this.updateBar();
    }

    private pickedBands(): HTMLElement[] {
        const host = document.getElementById('results');
        return host ? Array.from(host.querySelectorAll<HTMLElement>('tbody.lq-picked')) : [];
    }

    private updateBar(): void {
        if (!this.bar) return;
        const n = this.pickedBands().length;
        const count = this.bar.querySelector('.lq-pick-count') as HTMLElement | null;
        if (count) count.textContent = `${n}개 선택`;
        const save = this.bar.querySelector('[data-act="save"]') as HTMLButtonElement | null;
        if (save) save.disabled = n === 0;
    }

    // ── 저장 ───────────────────────────────────────────────────────

    private async save(): Promise<void> {
        const host = document.getElementById('results');
        const picked = this.pickedBands();
        if (!host || !picked.length) return;

        // 큰 선택(전체 선택 등)은 지연 mount·CSS 수집으로 몇 초 걸릴 수 있어 진행 상태를 남긴다.
        const save = this.bar?.querySelector('[data-act="save"]') as HTMLButtonElement | null;
        const label = save?.innerHTML;
        if (save) { save.disabled = true; save.textContent = '저장 중…'; }
        try {
            await exportViewAsHtml({
                source: host,
                title: this.docTitle(picked.length),
                filename: this.fileName(picked.length),
                removeSelectors: LAW_EXPORT_REMOVE,
                footnote: this.footnote(picked.length),
                // 대형 법령에서 '전체 선택'으로 고른 화면 밖 밴드는 아직 placeholder(빈 스페이서)다.
                // 복제 전에 실제 행으로 채워야 저장본에 내용이 들어간다.
                beforeSnapshot: () => picked.forEach(tb => this.controller.view.mountBlock(tb)),
                transformClone: (clone) => {
                    clone.querySelectorAll('tbody.lq-vblock:not(.lq-picked)').forEach(el => el.remove());
                    clone.querySelectorAll('tbody.lq-picked').forEach(el => el.classList.remove('lq-picked'));
                },
            });
            this.controller.view.showToast(`${picked.length}개 조를 HTML 파일로 저장했습니다`);
            this.exitMode();
        } catch (err) {
            console.error('법령 HTML 내보내기 실패', err);
            this.controller.view.showToast('저장에 실패했습니다');
        } finally {
            // 성공 시엔 exitMode 로 바가 이미 사라졌고, 실패 시엔 원래 라벨로 되돌려 재시도할 수 있게.
            if (save && label !== undefined) { save.innerHTML = label; this.updateBar(); }
        }
    }

    // ── 문서 제목·파일명·주석 ──────────────────────────────────────

    /** 표 헤더(법령명 메타)의 첫 줄 — 예: '전자금융거래법'. 없으면 현재법령 배지로 폴백. */
    private lawName(): string {
        const first = this.controller.view.getLawNames()[0];
        if (first) return first.split('\n')[0].trim();
        return document.getElementById('currentLawBox')?.textContent?.trim() || '법령';
    }

    /** 정렬기준(base)이 법이 아니면 그 단의 이름 — 제목에 '무엇을 축으로 본 표인지' 남긴다. */
    private baseName(): string {
        const params = new URLSearchParams(window.location.search);
        const base = (params.get('base') || 'a').toLowerCase();
        if (base === 'a') return '';
        const i = ['a', 'e', 's', 'r', 'b'].indexOf(base);
        if (i < 0) return '';
        const name = this.controller.view.getLawNames()[i];
        return name ? name.split('\n')[0].trim() : '';
    }

    private docTitle(n: number): string {
        const base = this.baseName();
        const axis = base ? ` (기준: ${base})` : '';
        return `${this.lawName()} 연계표${axis} — 선택 ${n}개 조`;
    }

    private fileName(n: number): string {
        return `법령_${this.lawName()}_연계표_${n}개조_${this.today().replace(/-/g, '')}`;
    }

    private footnote(n: number): string {
        return `이 문서는 LawQuery 법령 연계표에서 선택한 ${n}개 조를 정적 파일로 내보낸 참고자료입니다. `
            + `법령의 최신 개정 여부와 정확한 원문은 국가법령정보센터에서 확인하시기 바랍니다. `
            + `내보낸 날짜: ${this.today()}.`;
    }

    /** 로컬(KST) 기준 오늘 — toISOString 은 UTC 라 오전에 하루 밀린다. */
    private today(): string {
        const d = new Date();
        const p = (v: number) => String(v).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    }
}
