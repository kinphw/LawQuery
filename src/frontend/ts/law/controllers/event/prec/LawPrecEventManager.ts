import { ILawEventManager } from "../ILawEventManager";
import { makeDraggable, placeInViewport } from "../../../util/DraggablePopup";
import { precApi, PrecItem, PrecQuery } from "../../../../prec/PrecApi";
import { renderPrecDetail, renderPrecList } from "../../../../prec/PrecView";

/**
 * 조문 → 판례. 연계표 칸의 '판례' 단추(`.law-prec-btn`, LawTable 이 조 머리 칸에 단다)를 누르면
 * 그 조를 인용한 판례를 법제처 API 에서 그때그때 받아 떠 있는 창에 보인다(DB 적재 없음).
 *
 * - 이 조문: 본문에 "법령명 제N조" 문구가 있는 판례·헌재결정(따옴표 검색). '제N조의2' 처럼 뒤가 더 붙은 것도 걸린다.
 * - 법령 전체: 참조조문에 이 법령이 적힌 판례(법원 판례에만 있는 조건이라 헌재결정은 빠진다).
 * 목록 줄을 누르면 같은 창에서 판시사항·판결요지·참조조문·전문을 읽는다.
 * 로컬(오프라인)판은 이 모듈을 lawFeatureStub 으로 갈아끼워 단추를 감춘다.
 */
type Scope = 'jo' | 'law';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export class LawPrecEventManager implements ILawEventManager {
    private delegated = false;
    private popup: HTMLElement | null = null;
    private seq = 0;

    private reg = '';
    private jo = '';
    private scope: Scope = 'jo';
    private items: PrecItem[] = [];
    private total = 0;
    private hasMore = false;
    private page = 1;
    private listTop = 0;

    constructor(_controller?: unknown) { }

    bindEvents(): void {
        // #results 위임(한 번만) — 지연 렌더된 단추도 동작하고 재렌더에도 남는다.
        if (this.delegated) return;
        const host = document.getElementById('results');
        if (!host) return;
        this.delegated = true;
        host.addEventListener('click', (e) => {
            const btn = (e.target as HTMLElement).closest<HTMLElement>('.law-prec-btn');
            if (!btn) return;
            e.stopPropagation();
            this.open(btn.dataset.reg || '', btn.dataset.jo || '', (e as MouseEvent).clientX + 10, (e as MouseEvent).clientY + 10);
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.popup && !document.querySelector('.modal.show')) this.close();
        });
    }

    private query(): PrecQuery {
        return this.scope === 'jo' ? { q: `"${this.reg} ${this.jo}"`, in: 'body' } : { jo: this.reg };
    }

    private open(reg: string, jo: string, x: number, y: number): void {
        if (!reg || !jo) return;
        this.close();
        this.reg = reg;
        this.jo = jo;
        this.scope = 'jo';
        const el = document.createElement('div');
        el.className = 'law-ref-modal-popup lq-prec';
        el.innerHTML = `
            <div class="law-ref-popup-header" style="cursor:move;user-select:none;">
                <span>판례 · ${esc(reg)} ${esc(jo)}</span>
                <button type="button" class="btn-close btn-sm float-end" style="font-size:1.1em;" aria-label="닫기"></button>
            </div>
            <div class="lq-prec__scope btn-group btn-group-sm" role="group" aria-label="찾는 범위">
                <button type="button" class="btn btn-outline-secondary" data-scope="jo">이 조문</button>
                <button type="button" class="btn btn-outline-secondary" data-scope="law">법령 전체</button>
            </div>
            <div class="lq-prec__body"></div>`;
        document.body.appendChild(el);
        this.popup = el;
        placeInViewport(el, x, y);
        makeDraggable(el, el.querySelector('.law-ref-popup-header') as HTMLElement);

        el.addEventListener('click', (e) => {
            const t = e.target as HTMLElement;
            if (t.closest('.btn-close')) { this.close(); return; }
            const s = t.closest<HTMLElement>('[data-scope]');
            if (s) { this.scope = s.dataset.scope as Scope; void this.load(); return; }
            if (t.closest('[data-prec-more]')) { void this.more(); return; }
            if (t.closest('[data-prec-back]')) { this.renderList(); this.body().scrollTop = this.listTop; return; }
            const it = t.closest<HTMLElement>('[data-prec]');
            if (it) void this.detail(it.dataset.prec!);
        });
        void this.load();
    }

    private close(): void {
        this.seq++;
        this.popup?.remove();
        this.popup = null;
    }

    private body(): HTMLElement {
        return this.popup!.querySelector('.lq-prec__body') as HTMLElement;
    }

    private note(): string {
        return this.scope === 'jo'
            ? `본문에 “${esc(this.reg)} ${esc(this.jo)}” 문구가 있는 판례·헌재결정`
            : `참조조문에 ${esc(this.reg)}이(가) 적힌 판례`;
    }

    private fail(e: unknown): void {
        this.body().innerHTML = `<div class="lq-prec__empty text-danger">${esc(e instanceof Error ? e.message : String(e))}</div>`;
    }

    private async load(): Promise<void> {
        const seq = ++this.seq;
        this.popup!.querySelectorAll<HTMLElement>('[data-scope]').forEach((b) => b.classList.toggle('active', b.dataset.scope === this.scope));
        this.body().innerHTML = '<div class="lq-prec__empty">판례를 찾는 중…</div>';
        try {
            const r = await precApi.search(this.query(), 1);
            if (seq !== this.seq) return;
            this.items = r.items;
            this.total = r.total;
            this.hasMore = r.more;
            this.page = 1;
            this.renderList();
        } catch (e) {
            if (seq === this.seq) this.fail(e);
        }
    }

    private async more(): Promise<void> {
        const seq = this.seq;
        const btn = this.popup!.querySelector<HTMLButtonElement>('[data-prec-more]');
        if (btn) { btn.disabled = true; btn.textContent = '불러오는 중…'; }
        try {
            const r = await precApi.search(this.query(), this.page + 1);
            if (seq !== this.seq) return;
            this.page += 1;
            this.items = this.items.concat(r.items);
            this.hasMore = r.more;
            const top = this.body().scrollTop;
            this.renderList();
            this.body().scrollTop = top;
        } catch (e) {
            if (seq === this.seq && btn) { btn.disabled = false; btn.textContent = '다시 시도'; }
        }
    }

    private renderList(): void {
        // 같은 조건으로 판례검색 화면을 연다(낱말을 바꿔 가며 더 찾을 때)
        const sp = new URLSearchParams(this.scope === 'jo' ? { q: `${this.reg} ${this.jo}`, ph: '1' } : { q: this.reg });
        this.body().innerHTML =
            `<div class="lq-prec__note">${this.note()} · <strong>${this.total.toLocaleString('ko-KR')}</strong>건 · 최신순 · 법제처 제공
               · <a href="prec.html?${sp}" target="_blank" rel="noopener">판례검색에서 열기</a></div>`
            + renderPrecList(this.items, this.hasMore);
    }

    private async detail(id: string): Promise<void> {
        const seq = ++this.seq;
        const body = this.body();
        this.listTop = body.scrollTop;
        body.innerHTML = '<div class="lq-prec__empty">판례를 여는 중…</div>';
        try {
            const d = await precApi.detail(id);
            if (seq !== this.seq) return;
            body.innerHTML = renderPrecDetail(d, [`${this.reg} ${this.jo}`]);
            body.scrollTop = 0;
        } catch (e) {
            if (seq !== this.seq) return;
            body.innerHTML = `<div class="lq-prec__head"><button type="button" class="btn btn-sm btn-outline-secondary" data-prec-back>← 목록</button>
                <a class="btn btn-sm btn-link" href="${precApi.publicUrl(id)}" target="_blank" rel="noopener noreferrer">법령정보센터 ↗</a></div>
                <div class="lq-prec__empty text-danger">${esc(e instanceof Error ? e.message : String(e))}</div>`;
        }
    }
}
