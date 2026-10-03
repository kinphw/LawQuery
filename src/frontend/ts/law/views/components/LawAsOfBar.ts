import { HistTier } from '../../history/HistoryModel';
import { LawSnapshot, SnapVersion } from '../../types/LawSnapshot';

const TIERS = ['a', 'e', 's', 'r', 'b'];

const esc = (s: string | null | undefined): string =>
    String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** '20260803' → '2026. 8. 3.' */
const fmt = (d: string | null | undefined): string =>
    d && /^\d{8}$/.test(d) ? `${d.slice(0, 4)}. ${Number(d.slice(4, 6))}. ${Number(d.slice(6, 8))}.` : (d || '');

/** '20260803' → '2026.8.3' — 입력칸에 쓰는 짧은 표기(다시 읽어도 같은 날짜). */
const short = (d: string | null | undefined): string =>
    d && /^\d{8}$/.test(d) ? `${d.slice(0, 4)}.${Number(d.slice(4, 6))}.${Number(d.slice(6, 8))}` : '';

const pad = (n: number): string => String(n).padStart(2, '0');
const ymd = (dt: Date): string => `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}`;
const today = (): string => ymd(new Date());
const toDate = (d: string): Date => new Date(Number(d.slice(0, 4)), Number(d.slice(4, 6)) - 1, Number(d.slice(6, 8)));

const dayBefore = (d: string): string => {
    const dt = toDate(d);
    dt.setDate(dt.getDate() - 1);
    return ymd(dt);
};

const yearsAgo = (n: number): string => {
    const dt = new Date();
    dt.setFullYear(dt.getFullYear() - n);
    return ymd(dt);
};

/**
 * 느슨한 날짜 읽기 — 손에 익은 모양이면 무엇이든 받는다. 못 읽으면 null.
 *   2024.9.15 · 2024-09-15 · 2024/9/15 · 2024. 9. 15. · 20240915 · 240915 · 24.9.15
 *   2024년 9월 15일 · 2024.9(→ 9월 1일) · 2024(→ 1월 1일) · 오늘·현행 · 시행예정
 */
export function parseLooseDate(raw: string, sched?: string | null): string | null {
    const s = raw.trim().replace(/\s+/g, '');
    if (!s) return null;
    if (/^(오늘|현행|today|now)$/i.test(s)) return today();
    if (/^시행예정/.test(s)) return sched ?? null;

    const century = (yy: number): number => yy + (yy > (new Date().getFullYear() % 100) + 1 ? 1900 : 2000);
    let y: number, mo = 1, d = 1;
    let m = s.match(/^(\d{4})(\d{2})(\d{2})$/) || s.match(/^(\d{2})(\d{2})(\d{2})$/);
    if (m) {
        y = m[1].length === 2 ? century(Number(m[1])) : Number(m[1]);
        mo = Number(m[2]);
        d = Number(m[3]);
    } else {
        const t = s.replace(/[년월]/g, '.').replace(/일$/, '').replace(/[-/]/g, '.').replace(/\.+$/, '');
        m = t.match(/^(\d{4}|\d{2})(?:\.(\d{1,2})(?:\.(\d{1,2}))?)?$/);
        if (!m) return null;
        y = m[1].length === 2 ? century(Number(m[1])) : Number(m[1]);
        if (m[2]) mo = Number(m[2]);
        if (m[3]) d = Number(m[3]);
    }
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;   // 2월 30일 같은 날짜
    return ymd(dt);
}

/**
 * LawAsOfBar — 연계표 위 '시점' 바.
 *
 * '변경 전' 날짜만 찍으면 그날 시행 중이던 법·시행령·감독규정·세칙으로 연계표를 그리고(?at=),
 * '변경 후'까지 찍으면 두 날짜의 시행본을 칸마다 대비한다(?vs=). URL 이 단일 출처라 링크·새로고침에도
 * 같은 화면이 재현된다. '개정 하나 골라 보기'는 그 개정의 시행일 전날 ↔ 시행일을 찍어 주는 바로가기다.
 * 문언은 연혁 아카이브(db_hist_*), 연계는 현행 한 벌이라 조번호로 짝짓는다.
 *
 * 날짜는 글자로 편하게 넣는다(parseLooseDate) — 달력은 버튼으로만 연다. 입력칸은 개정 시행일을
 * 자동완성 후보로 내놓고, '오늘'·'시행예정'·'n년 전'은 한 번 눌러 채운다.
 */
export class LawAsOfBar {

    static readonly HOST_ID = 'lawAsofHost';
    static readonly GONE_ID = 'lawGoneHost';

    constructor(private tiers: HistTier[], private names: Record<string, string>) { }

    static dates(): { at: string | null; vs: string | null } {
        const p = new URLSearchParams(window.location.search);
        const ok = (v: string | null) => (v && /^\d{8}$/.test(v) ? v : null);
        const at = ok(p.get('at'));
        const vs = ok(p.get('vs'));
        return { at, vs: at && vs !== at ? vs : null };
    }

    private static go(at: string | null, vs: string | null): void {
        if (at && vs && vs < at) [at, vs] = [vs, at];               // 옛 날짜가 '변경 전'
        const p = new URLSearchParams(window.location.search);
        if (at) p.set('at', at); else p.delete('at');
        if (at && vs && vs !== at) p.set('vs', vs); else p.delete('vs');
        window.location.search = p.toString();     // 리로드 → 전 조회 경로가 URL 의 날짜로 다시 그린다
    }

    private name(t: string): string {
        return this.names[t] || this.tiers.find(x => x.origin === t)?.short_name || t;
    }

    /** 가장 이른 시행예정일(없으면 null). */
    private schedDate(): string | null {
        return this.tiers.flatMap(t => t.versions).filter(v => v.status === '시행예정').map(v => v.ef_date).sort()[0] ?? null;
    }

    /** 날짜 칸 하나: 이름 + 빠른 채우기 / 글자 입력 + 달력 버튼(숨은 date 입력의 피커를 연다). */
    private dateBox(key: 'at' | 'vs', label: string, value: string | null, quicks: Array<[string, string]>, placeholder: string): string {
        const q = quicks.map(([l, d]) =>
            `<button type="button" data-fill="${key}" data-date="${d}" title="${fmt(d)}" aria-label="${label} ${esc(l)}(${fmt(d)})">${esc(l)}</button>`).join('');
        return `
            <div class="lq-asof-date">
                <div class="lq-asof-dhead">
                    <label for="lqAsof-${key}">${label}</label>
                    <span class="lq-asof-quick">${q}</span>
                </div>
                <div class="lq-asof-input">
                    <input type="text" id="lqAsof-${key}" data-asof="${key}" list="lqAsofDates" autocomplete="off"
                        placeholder="${placeholder}" value="${short(value)}">
                    <button type="button" class="lq-asof-calbtn" data-cal="${key}" title="달력에서 고르기" aria-label="${label} 달력에서 고르기">
                        <i class="far fa-calendar"></i></button>
                    <input type="date" class="lq-asof-cal" data-calinput="${key}" tabindex="-1" aria-hidden="true">
                </div>
            </div>`;
    }

    render(): void {
        const host = document.getElementById(LawAsOfBar.HOST_ID);
        if (!host) return;
        const { at, vs } = LawAsOfBar.dates();

        if (!this.tiers.length) {
            host.innerHTML = at
                ? `<div class="lq-asof lq-asof--warn">이 법령은 연혁이 적재되지 않아 날짜로 볼 수 없습니다.
                     <button type="button" class="btn btn-sm btn-outline-secondary" data-asof="reset">현행으로</button></div>`
                : '';
            host.querySelector('[data-asof="reset"]')?.addEventListener('click', () => LawAsOfBar.go(null, null));
            return;
        }

        // 개정 목록: 단마다 가장 옛 시행본(적재 출발점)은 '개정'이 아니라 빼고, 최신순
        const revs = this.tiers
            .flatMap(t => t.versions.filter(v => v.article_count > 0).slice(1).map(v => ({ t: t.origin, v })))
            .sort((x, y) => y.v.ef_date.localeCompare(x.v.ef_date) || TIERS.indexOf(x.t) - TIERS.indexOf(y.t))
            .slice(0, 200);
        const opts = revs.map(({ t, v }) => {
            const st = v.status === '시행예정' ? ' (시행예정)' : '';
            return `<option value="${v.ef_date}">${fmt(v.ef_date)} · ${esc(this.name(t))} ${esc(v.rev_kind)} ${v.prom_no ? `제${esc(v.prom_no)}호` : ''}${st}</option>`;
        }).join('');

        // 자동완성 후보: 개정 시행일(같은 날 여러 단이면 한 줄로)
        const byDate = new Map<string, string[]>();
        for (const { t, v } of revs) {
            const arr = byDate.get(v.ef_date) ?? [];
            arr.push(`${this.name(t)} ${v.rev_kind ?? ''}`.trim());
            byDate.set(v.ef_date, arr);
        }
        const datalist = [...byDate.entries()]
            .map(([d, what]) => `<option value="${short(d)}" label="${esc(what.join(' · '))}"></option>`).join('');

        const sched = this.schedDate();
        host.innerHTML = `
            <div class="lq-asof" id="lqAsofForm">
                <span class="lq-asof-lbl"><i class="far fa-calendar"></i> 시점</span>
                ${this.dateBox('at', '변경 전', at, [['1년 전', yearsAgo(1)], ['3년 전', yearsAgo(3)], ['5년 전', yearsAgo(5)]], '예: 2024.9.15')}
                <span class="lq-asof-arrow" aria-hidden="true">→</span>
                ${this.dateBox('vs', '변경 후', vs, [['오늘', today()], ...(sched ? [['시행예정', sched] as [string, string]] : [])], '예: 오늘 (비워도 됨)')}
                <div class="lq-asof-actions">
                    <button type="button" class="btn btn-sm btn-dark" data-asof="apply">보기</button>
                    ${at ? '<button type="button" class="btn btn-sm btn-outline-secondary" data-asof="reset">현행으로</button>' : ''}
                </div>
                <select class="form-select form-select-sm lq-asof-rev" data-asof="rev" aria-label="개정 하나 골라 보기">
                    <option value="">개정 하나 골라 보기 — 시행 전날과 시행일을 대비</option>${opts}
                </select>
            </div>
            <datalist id="lqAsofDates">${datalist}</datalist>
            <div class="lq-asof-msg" data-asof="msg" hidden></div>
            <div class="lq-asof-foot">
                <div class="lq-asof-sum" data-asof="sum">${at ? '<span class="text-muted">불러오는 중…</span>' : this.idleText()}</div>
                <button type="button" class="btn btn-sm btn-outline-secondary lq-asof-toggle" data-asof="toggle"
                    aria-expanded="false" aria-controls="lqAsofForm"><i class="far fa-calendar"></i> 날짜 <i class="fas fa-chevron-down"></i></button>
                <span class="lq-asof-slot" data-asof="slot"></span>
            </div>
            <div class="lq-asof-help" data-asof="help" hidden></div>`;

        this.adoptFilterButton(host);
        this.wire(host, sched);
    }

    /**
     * '개정비교'(날짜 대비 중엔 '달라진 줄만') 버튼을 검색 카드에서 이 바의 요약줄 끝으로 옮겨 온다 —
     * 무엇을 견주는지 적힌 줄 바로 옆이 그 필터의 자리다. 노드를 옮길 뿐이라 id·리스너(LawRevisionEventManager)는
     * 그대로 산다. 연혁이 없어 바를 그리지 않는 법령에선 원래 자리에 남는다.
     */
    private adoptFilterButton(host: HTMLElement): void {
        const btn = document.getElementById('lawRevisionBtn');
        const slot = host.querySelector('[data-asof="slot"]');
        if (!btn || !slot) return;
        btn.classList.remove('ms-2');
        btn.classList.add('btn-sm');
        slot.appendChild(btn);
    }

    /** ⓘ 안내 — 평소엔 쓰는 법, 날짜를 찍은 뒤엔 짝짓기의 한계. 요약줄에 한 줄을 따로 쓰지 않으려고 접어 둔다. */
    private helpText(): string {
        return LawAsOfBar.dates().at
            ? '연계(어느 조가 어느 하위규정에 걸리는지)는 현행 기준이고, 옛 문언은 조번호로 짝짓습니다. 전부개정이나 조 이동이 있었다면 번호가 같아도 다른 내용일 수 있습니다.'
            : '‘변경 전’ 날짜만 넣으면 그날 시행 중이던 연계표를, ‘변경 후’까지 넣으면 두 날짜의 문언을 칸마다 대비합니다.';
    }

    private infoButton(): string {
        return `<button type="button" class="lq-asof-info" data-asof="info" aria-label="도움말" aria-expanded="false"
            title="${esc(this.helpText())}"><i class="fas fa-circle-info"></i></button>`;
    }

    private wire(host: HTMLElement, sched: string | null): void {
        const input = (k: string) => host.querySelector(`[data-asof="${k}"]`) as HTMLInputElement;
        const msg = host.querySelector('[data-asof="msg"]') as HTMLElement;
        const clear = (el: HTMLInputElement) => { el.classList.remove('is-invalid'); msg.hidden = true; };

        const apply = (): void => {
            const bad: string[] = [];
            const read = (el: HTMLInputElement): string | null => {
                const raw = el.value.trim();
                if (!raw) return null;
                const d = parseLooseDate(raw, sched);
                if (!d) { el.classList.add('is-invalid'); bad.push(raw); }
                return d;
            };
            let a = read(input('at'));
            let b = read(input('vs'));
            if (bad.length) {
                msg.textContent = `‘${bad.join('’, ‘')}’을(를) 날짜로 읽지 못했습니다 — 예: 2024.9.15 · 20240915 · 24.9.15 · 2024년 9월 · 오늘`;
                msg.hidden = false;
                return;
            }
            if (!a && b) { a = b; b = null; }                         // '변경 후'만 찍었으면 그 날짜 시행본으로
            LawAsOfBar.go(a, b);
        };

        host.querySelector('[data-asof="apply"]')?.addEventListener('click', apply);

        // 좁은 화면: 입력부는 '날짜' 버튼으로 접어 두고 요약줄만 남긴다(첫 화면이 컨트롤로 다 차지 않게)
        const toggle = host.querySelector('[data-asof="toggle"]') as HTMLButtonElement | null;
        toggle?.addEventListener('click', () => {
            const open = host.classList.toggle('is-open');
            toggle.setAttribute('aria-expanded', String(open));
            if (open) input('at').focus();
        });

        // ⓘ — 요약줄은 renderSummary 가 갈아 끼우므로 위임으로 받는다
        const help = host.querySelector('[data-asof="help"]') as HTMLElement;
        host.addEventListener('click', (e) => {
            const info = (e.target as HTMLElement).closest('[data-asof="info"]');
            if (!info) return;
            help.textContent = this.helpText();
            help.hidden = !help.hidden;
            info.setAttribute('aria-expanded', String(!help.hidden));
        });
        host.querySelector('[data-asof="reset"]')?.addEventListener('click', () => LawAsOfBar.go(null, null));
        host.querySelector('[data-asof="rev"]')?.addEventListener('change', (e) => {
            const ef = (e.target as HTMLSelectElement).value;
            if (ef) LawAsOfBar.go(dayBefore(ef), ef);
        });

        // Enter: '변경 전'이면 '변경 후'로 넘어가고, '변경 후'면 바로 보기
        (['at', 'vs'] as const).forEach(k => {
            const el = input(k);
            el.addEventListener('input', () => clear(el));
            el.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                if (k === 'at' && !input('vs').value.trim()) input('vs').focus(); else apply();
            });
        });

        // 빠른 채우기: 칸만 채운다(보기는 사용자가) — 두 칸을 다 정한 뒤 한 번에 보게
        host.querySelectorAll<HTMLButtonElement>('[data-fill]').forEach(b => b.addEventListener('click', () => {
            const el = input(b.dataset.fill as string);
            el.value = short(b.dataset.date as string);
            clear(el);
            el.focus();
        }));

        // 달력: 숨은 date 입력의 피커를 열고, 고른 날짜를 글자 칸에 적는다
        host.querySelectorAll<HTMLButtonElement>('[data-cal]').forEach(b => b.addEventListener('click', () => {
            const k = b.dataset.cal as string;
            const cal = host.querySelector(`[data-calinput="${k}"]`) as HTMLInputElement;
            const cur = parseLooseDate(input(k).value, sched);
            cal.value = cur ? `${cur.slice(0, 4)}-${cur.slice(4, 6)}-${cur.slice(6, 8)}` : '';
            try { (cal as HTMLInputElement & { showPicker?: () => void }).showPicker?.(); } catch { cal.focus(); }
        }));
        host.querySelectorAll<HTMLInputElement>('[data-calinput]').forEach(cal => cal.addEventListener('change', () => {
            const el = input(cal.dataset.calinput as string);
            if (cal.value) { el.value = short(cal.value.replace(/-/g, '')); clear(el); el.focus(); }
        }));
    }

    private idleText(): string {
        const sched = this.schedDate();
        return `<span class="lq-asof-head">현행 연계표${sched ? ` · 시행예정 개정(${fmt(sched)})은 칸 안에 겹쳐 보입니다` : ''}${this.infoButton()}</span>`;
    }

    /** 데이터를 받은 뒤: 무엇을 무엇과 견주는지 단마다 적는다. */
    renderSummary(snap: LawSnapshot | null): void {
        const sum = document.querySelector(`#${LawAsOfBar.HOST_ID} [data-asof="sum"]`);
        const { at } = LawAsOfBar.dates();
        if (!sum || !at) return;
        if (!snap) {
            sum.innerHTML = '<span class="text-danger">날짜 조회를 불러오지 못했습니다 — 이 법령의 연혁이 적재돼 있는지 확인하세요.</span>';
            return;
        }
        const title = (v: SnapVersion | null) => v ? `${esc(v.name)} ${esc(v.rev_kind)} ${v.prom_no ? `제${esc(v.prom_no)}호` : ''}` : '';
        const head = snap.vs
            ? `<b>${fmt(snap.older)}</b><span class="lq-asof-arrow">→</span><b>${fmt(snap.newer)}</b>${snap.newer === today() ? '<span class="lq-asof-today">오늘</span>' : ''}`
            : `<b>${fmt(snap.at)}</b> 시행본`;
        // 단별 시행본: 단 이름(작은 회색) + 시행일. '본'·테두리를 되풀이하지 않고 구분선으로만 나눈다.
        const nmTag = (nm: string) => `<span class="lq-asof-chip__nm">${nm}</span>`;
        const arrow = '<span class="lq-asof-arrow">→</span>';
        const chips = TIERS.filter(t => snap.tiers[t]).map(t => {
            const x = snap.tiers[t];
            const nm = esc(this.name(t));
            if (!snap.vs) {
                return `<span class="lq-asof-chip" title="${title(x.newer)}">${nmTag(nm)}${x.newer ? fmt(x.newer.ef_date) : '그때 없음'}</span>`;
            }
            const same = !!x.older && !!x.newer && x.older.ef_date === x.newer.ef_date && x.older.prom_no === x.newer.prom_no;
            const tip = `${title(x.older)} → ${title(x.newer)}`;
            return same
                ? `<span class="lq-asof-chip same" title="${tip}">${nmTag(nm)}${fmt(x.newer!.ef_date)} 그대로</span>`
                : `<span class="lq-asof-chip" title="${tip}">${nmTag(nm)}${x.older ? fmt(x.older.ef_date) : '없음'}${arrow}${x.newer ? fmt(x.newer.ef_date) : '없음'}</span>`;
        }).join('');
        sum.innerHTML = `<span class="lq-asof-head">${head}${this.infoButton()}</span>${chips}`;
    }

    /** 두 날짜에 있었지만 지금 연계표에 자리가 없는 조 — 표 아래에 모아 보인다. */
    renderGone(snap: LawSnapshot | null): void {
        const host = document.getElementById(LawAsOfBar.GONE_ID);
        if (!host) return;
        if (!snap || !snap.gone.length) { host.innerHTML = ''; return; }
        const where = (g: LawSnapshot['gone'][number]) => !snap.vs ? `${fmt(snap.at)}엔 있던 조`
            : g.older && !g.newer ? `${fmt(snap.older)}엔 있고 ${fmt(snap.newer)}엔 없음`
            : !g.older && g.newer ? `${fmt(snap.newer)}에만 있음`
            : '두 날짜 모두 있음';
        const items = snap.gone.map(g => `
            <details class="lq-gone-item">
                <summary><span class="lq-gone-tier">${esc(this.name(g.tier))}</span> ${esc(g.title || g.key)} <span class="lq-gone-where">${where(g)}</span></summary>
                <div class="lq-gone-body">${esc(g.newer ?? g.older ?? '').replace(/\n/g, '<br>')}</div>
            </details>`).join('');
        host.innerHTML = `
            <div class="container lq-gone">
                <div class="lq-gone-head">지금 연계표에 자리가 없는 조문 ${snap.gone.length}건 <span>— 그 뒤 삭제됐거나 번호가 옮겨진 조</span></div>
                ${items}
            </div>`;
    }
}
