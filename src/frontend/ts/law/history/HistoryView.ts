import { HistCompare, HistTier, HistVersion } from './HistoryModel';
import { buildRows } from './OldNewDiff';

/** 단 코드 → 고른 두 버전(종전·개정). null = 그 단은 비교 안 함. */
export type Pick = { old: string; new: string } | null;
export type PickMap = Map<string, Pick>;

const esc = (s: string | null | undefined): string =>
    String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** '20261217' → '2026. 12. 17.' */
export function fmtDate(raw: string | null | undefined): string {
    const d = (raw || '').replace(/\D/g, '');
    if (d.length !== 8) return raw || '';
    return `${d.slice(0, 4)}. ${Number(d.slice(4, 6))}. ${Number(d.slice(6, 8))}.`;
}

/**
 * HistoryView — 연혁비교 화면.
 *
 *   ┌ 연혁비교 ──────────────────────────────────────────────┐
 *   │ 법률     종전 [2024. 9. 15. 시행 ▾] → 개정 [2025. 12. 16. ▾]  변경 3개 조 │
 *   │ 감독규정 종전 [비교 안 함 ▾]                                         │
 *   └──────────────────────────────────────────────────────┘
 *   ■ 법률  (종전 | 개정 좌우 2단 신구대비표)
 *   ■ 시행령 …
 *
 * 그리기만 한다 — 무엇을 고를지·언제 불러올지는 HistoryController 가 정한다.
 */
export class HistoryView {

    constructor(private host: HTMLElement) { }

    static verLabel(v: HistVersion): string {
        const no = v.prom_no ? `제${v.prom_no}호` : '';
        const st = v.status && v.status !== '연혁' ? ` (${v.status})` : '';
        return `${fmtDate(v.ef_date)} 시행 · ${no} ${v.rev_kind ?? ''}${st}`.replace(/\s+/g, ' ').trim();
    }

    renderLoadingShell(): void {
        this.host.innerHTML = `<div class="text-muted small py-4 text-center">
            <span class="spinner-border spinner-border-sm me-1"></span> 연혁 목록을 불러오는 중…</div>`;
    }

    renderEmpty(): void {
        this.host.innerHTML = `
            <div class="alert alert-secondary">
                이 법령에는 연혁 데이터가 아직 적재되지 않았습니다.
                <div class="small text-muted mt-1">LawQuery-law 에서 <code>python -m pipeline.history &lt;코드&gt; --apply</code> 로 적재합니다.</div>
            </div>`;
    }

    renderShell(tiers: HistTier[], picks: PickMap): void {
        const rows = tiers.map(t => this.controlRow(t, picks.get(t.origin) ?? null)).join('');
        const secs = tiers.map(t =>
            `<section class="lq-hist-sec" id="hist-${t.origin}" data-sec="${t.origin}" hidden></section>`).join('');
        this.host.innerHTML = `
            <div class="card lq-hist-ctl mb-3">
                <div class="card-body py-2">
                    <div class="d-flex flex-wrap align-items-baseline gap-2 mb-2">
                        <span class="fw-bold"><i class="fas fa-clock-rotate-left"></i> 연혁비교</span>
                        <span class="small text-muted">규정마다 두 시점을 골라 신구대비표로 봅니다. 달라진 조만 표시합니다.</span>
                        <span class="small ms-auto lq-hist-legend">
                            <span class="lq-h-del">종전 문언</span> <span class="lq-h-ins">개정 문언</span>
                        </span>
                    </div>
                    <div class="lq-hist-rows">${rows}</div>
                </div>
            </div>
            ${secs}`;
    }

    private controlRow(t: HistTier, pick: Pick): string {
        const name = esc(t.short_name);
        const desc = [...t.versions].reverse();                     // 최신이 위
        const opt = (v: HistVersion, selected: string | undefined): string =>
            `<option value="${esc(v.ver_ref)}"${v.ver_ref === selected ? ' selected' : ''}${v.article_count ? '' : ' disabled'}>`
            + `${esc(HistoryView.verLabel(v))}${v.article_count ? '' : ' — 본문 없음'}</option>`;

        return `
            <div class="lq-hist-row" data-tier="${t.origin}">
                <span class="lq-hist-tier" title="${esc(t.full_name.split('\n')[0])}">${name}</span>
                <span class="lq-hist-lbl">종전</span>
                <select class="form-select form-select-sm" data-role="old" aria-label="${name} 종전 버전">
                    <option value="none"${pick ? '' : ' selected'}>비교 안 함</option>
                    ${desc.map(v => opt(v, pick?.old)).join('')}
                </select>
                <span class="lq-hist-arrow">→</span>
                <span class="lq-hist-lbl">개정</span>
                <select class="form-select form-select-sm" data-role="new" aria-label="${name} 개정 버전"${pick ? '' : ' disabled'}>
                    ${desc.map(v => opt(v, pick?.new)).join('')}
                </select>
                <a class="lq-hist-count small" href="#hist-${t.origin}" data-count>${t.versions.length < 2 ? '버전 1개뿐' : ''}</a>
            </div>`;
    }

    /** 드롭다운이 바뀌면 (단, 바뀐 쪽, 종전값, 개정값)으로 알린다. */
    onChange(cb: (origin: string, role: 'old' | 'new', oldRef: string, newRef: string) => void): void {
        this.host.addEventListener('change', (e) => {
            const sel = e.target;
            if (!(sel instanceof HTMLSelectElement) || !sel.dataset.role) return;
            const row = sel.closest<HTMLElement>('[data-tier]');
            if (!row) return;
            const oldSel = row.querySelector<HTMLSelectElement>('select[data-role="old"]');
            const newSel = row.querySelector<HTMLSelectElement>('select[data-role="new"]');
            if (!oldSel || !newSel) return;
            cb(row.dataset.tier as string, sel.dataset.role as 'old' | 'new', oldSel.value, newSel.value);
        });
    }

    /** 컨트롤러가 보정한 선택(순서 맞바꿈 등)을 드롭다운에 되돌려 적는다. */
    setPick(origin: string, pick: Pick): void {
        const row = this.host.querySelector<HTMLElement>(`[data-tier="${origin}"]`);
        const oldSel = row?.querySelector<HTMLSelectElement>('select[data-role="old"]');
        const newSel = row?.querySelector<HTMLSelectElement>('select[data-role="new"]');
        if (!oldSel || !newSel) return;
        oldSel.value = pick ? pick.old : 'none';
        newSel.disabled = !pick;
        if (pick) newSel.value = pick.new;
    }

    private section(origin: string): HTMLElement | null {
        return this.host.querySelector<HTMLElement>(`[data-sec="${origin}"]`);
    }

    private setCount(origin: string, text: string): void {
        const a = this.host.querySelector<HTMLElement>(`[data-tier="${origin}"] [data-count]`);
        if (a) a.textContent = text;
    }

    private title(t: HistTier, extra: string): string {
        return `<h2 class="lq-hist-title"><span class="badge text-bg-dark">${esc(t.short_name)}</span>${extra}
                    <a href="#${HistoryView.HOST_TOP}" class="lq-hist-top small ms-auto">맨 위로</a></h2>`;
    }

    static readonly HOST_TOP = 'lawHistHost';

    renderHidden(t: HistTier): void {
        const sec = this.section(t.origin);
        if (sec) { sec.hidden = true; sec.innerHTML = ''; }
        this.setCount(t.origin, t.versions.length < 2 ? '버전 1개뿐' : '');
    }

    renderMessage(t: HistTier, html: string, count = ''): void {
        const sec = this.section(t.origin);
        if (!sec) return;
        sec.hidden = false;
        sec.innerHTML = `${this.title(t, '')}<div class="alert alert-light border small mb-0">${html}</div>`;
        this.setCount(t.origin, count);
    }

    renderLoading(t: HistTier): void {
        this.renderMessage(t, '<span class="spinner-border spinner-border-sm me-1"></span> 대비표를 만드는 중…', '…');
    }

    private head(v: HistVersion, side: string): string {
        const no = v.prom_no ? `제${esc(v.prom_no)}호` : '';
        const bits = [`${esc(v.kind_name)} ${no}`.trim(), fmtDate(v.prom_date), esc(v.rev_kind)].filter(Boolean).join(', ');
        const st = v.status && v.status !== '연혁' ? ` · ${esc(v.status)}` : '';
        return `<th><span class="lq-hist-side">${side}</span>${esc(v.name)}
                    <small>[시행 ${fmtDate(v.ef_date)}]${bits ? ` [${bits}]` : ''}${st}</small></th>`;
    }

    renderCompare(t: HistTier, res: HistCompare): void {
        const sec = this.section(t.origin);
        if (!sec) return;
        const n = res.changes.length;
        if (!n) {
            this.renderMessage(t, '두 버전 사이에 달라진 조문이 없습니다. <span class="text-muted">(개정 표기 &lt;개정 …&gt; 만 다른 조는 같은 것으로 봅니다)</span>', '변경 없음');
            return;
        }
        const body = res.changes.map(c =>
            buildRows(c.old, c.new).map((r, i) =>
                `<tr class="lq-h-${r.kind}${i === 0 ? ' lq-hist-art-start' : ''}"><td>${r.left}</td><td>${r.right}</td></tr>`,
            ).join(''),
        ).join('');

        sec.hidden = false;
        sec.innerHTML = `
            ${this.title(t, ` 변경 ${n}개 조 <small class="text-muted fw-normal">· 종전 ${res.total.old}개 조 → 개정 ${res.total.new}개 조</small>`)}
            <div class="table-responsive">
                <table class="table table-bordered lq-hist-table mb-0">
                    <thead><tr>${this.head(res.old, '종전')}${this.head(res.new, '개정')}</tr></thead>
                    <tbody>${body}</tbody>
                </table>
            </div>`;
        this.setCount(t.origin, `변경 ${n}개 조`);
    }
}
