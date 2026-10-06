// import { LawResult } from '../../types/LawResult';
import { LawTitle } from '../../types/LawTitle';
import { LawCmp, LawTreeNode } from '../../types/LawTreeNode';
import { LawView } from '../LawView';
import { getLawConfig } from '../../config/LawConfig';
import { isRevised } from '../../util/RevisionFilter';

type Path = [
    LawTreeNode | null, LawTreeNode | null,
    LawTreeNode | null, LawTreeNode | null, LawTreeNode | null];

/** 스크롤 앵커 — 기준선에 걸린 조문 셀 id + 그 셀 안에서의 상대 위치(0~1). */
export interface LawScrollAnchor {
    id: string;
    ratio: number;
}

export class LawTable {

    // Test
    private lawView: LawView;
    private step: number;
    // 현재 정렬기준(base)에 해당하는 컬럼 인덱스 → 해당 열을 강조 표시
    private highlightCol: number;
    // 1단(상위·하위 단 없는 단독 규정) = 문서 모드: 대조표가 아니라 규정 한 편을 읽는 화면으로 그린다.
    private doc = false;

    // 법령명 thead 설정을 위한 클래스변수 // 250623
    public names: string[] = [];

    // 0: 법 / 1: 시행령 / 2: 감독규정 / 3: 세칙 / 4: 별표
    private static readonly COL_CLASS = [
        'law-title', 'decree-title', 'regulation-title', 'rule-title', 'book-title'
    ] as const;
    private static readonly INDENT_CLASS = [
        '', 'tree-indent-1', 'tree-indent-2', 'tree-indent-3', 'tree-indent-4'
    ] as const;

    // constructor(lawView: LawView) {
    //     this.lawView = lawView; // Dependency injection
    // }


    constructor(lawView: LawView) {
        this.lawView = lawView; // Dependency injection

        // URL에서 law, step 파라미터 읽기
        const urlParams = new URLSearchParams(window.location.search);
        const law = urlParams.get('law') || 'j';
        this.names = getLawConfig(law).names;
        this.step = parseInt(urlParams.get('step') || '4', 10);
        this.doc = this.step === 1;

        // 정렬기준(base) → 컬럼 인덱스(a=0,e=1,s=2,r=3,b=4). 없으면 법(0).
        const base = (urlParams.get('base') || 'a').toLowerCase();
        const bi = ['a', 'e', 's', 'r', 'b'].indexOf(base);
        this.highlightCol = bi >= 0 ? Math.min(bi, this.step - 1) : 0;

        // this.names = law === 'y'
        //     ? [
        //         '여신전문금융업법[시행 2025. 4. 22.] [법률 제20716호, 2025. 1. 21., 일부개정]',
        //         '여신전문금융업법 시행령[시행 2024. 12. 10.] [대통령령 제35064호, 2024. 12. 10., 일부개정]',
        //         '여신전문금융업법 시행규칙[시행 2020. 8. 5.] [총리령 제1635호, 2020. 8. 5., 타법개정]',
        //         '여신전문금융업감독규정[시행 2025. 2. 14.] [금융위원회고시 제2025-3호, 2025. 2. 5., 일부개정]',
        //         '여신전문금융업감독업무시행세칙[시행 2024. 6. 28.] [금융감독원세칙 , 2024. 6. 28., 일부개정]'
        //     ]
        //     : [
        //         '전자금융거래법\n[시행 2024. 9. 15.]\n[법률 제19734호, 2023. 9. 14., 일부개정]',
        //         '전자금융거래법 시행령\n[시행 2024. 12. 27.]\n[대통령령 제35038호, 2024. 12. 3., 타법개정]',
        //         '전자금융감독규정\n[시행 2025. 2. 5.]\n[금융위원회고시 제2025-4호, 2025. 2. 5., 일부개정]',
        //         '전자금융감독규정시행세칙\n[시행 2025. 2. 5.]\n[금융감독원세칙 , 2025. 2. 3., 일부개정]'
        //     ];
    }

    // 법령명 thead 설정을 위한 클래스변수
    // public names : string[] = [
    //     '전자금융거래법\n[시행 2024. 9. 15.]\n[법률 제19734호, 2023. 9. 14., 일부개정]',
    //     '전자금융거래법 시행령\n[시행 2024. 12. 27.]\n[대통령령 제35038호, 2024. 12. 3., 타법개정]',
    //     '전자금융감독규정\n[시행 2025. 2. 5.]\n[금융위원회고시 제2025-4호, 2025. 2. 5., 일부개정]',
    //     '전자금융감독규정시행세칙\n[시행 2025. 2. 5.]\n[금융감독원세칙 , 2025. 2. 3., 일부개정]'
    // ]

    private currentTextSize: string = ''; // Add text size state

    // ── 가상화(윈도잉): 대형 법령(자본시장법 등)만 적용 ──
    private static readonly WINDOW_MIN = 150;   // 루트 블록 수가 이보다 많으면 윈도잉
    private static readonly WINDOW_INITIAL = 12; // 즉시 렌더할 첫 블록 수('누르면 바로')
    private winResults: LawTreeNode[] | null = null;
    private winSearch = '';
    private observer: IntersectionObserver | null = null;


    render(results: LawTreeNode[], searchText: string = ''): string {
        if (!results.length) {
            return '<div class="alert alert-warning">표시할 법령이 없습니다.</div>';
        }

        // 강조쌍 인덱스 — '상위(up) 조'별. 그 조를 같은 행의 하위가 인용한 항/호를 강조.
        this.hlIndex = new Map();
        for (const h of this.lawView.getHighlights()) {
            const k = this.jo(h.up);
            const arr = this.hlIndex.get(k);
            if (arr) arr.push(h); else this.hlIndex.set(k, [h]);
        }

        const windowed = results.length > LawTable.WINDOW_MIN;   // 대형 법령만 가상화(소·중형은 기존 경로)
        this.winResults = null;                                  // 매 렌더마다 초기화

        // --lq-step: 단(段) 수를 CSS 로 넘긴다. step 은 URL 파라미터라 CSS 가 알 수 없는데,
        // 모바일 세로에서 최소폭을 '단 수 × 열폭'으로 잡아야 4단·5단의 열 폭이 같아진다(_responsive.scss).
        let html = `<div class="table-responsive law-table-wrap${this.doc ? ' law-table-wrap--doc' : ''}">`
            + `<table class="table table-bordered law-table${this.doc ? ' law-table--doc' : ''}" style="--lq-step:${this.step}">`;
        // 윈도잉 시 placeholder(colspan 행)가 열폭을 깨지 않도록 colgroup으로 폭 고정(table-layout:fixed)
        if (windowed) {
            const w = (100 / this.step).toFixed(4);
            html += '<colgroup>' + Array(this.step).fill(`<col style="width:${w}%">`).join('') + '</colgroup>';
        }
        html += `
            <thead class="table-dark sticky-top">
                <tr>
                    ${this.names.slice(0, this.step).map((name, i) => {
            const parts = name.split('\n');
            if (this.doc) return this.docTitle(parts);
            const hl = i === this.highlightCol ? ' lq-base-col' : '';
            return `<th class="text-center py-1${hl}">
                            <div class="small">${parts[0]}</div>
                            <div class="text-xs">${parts.slice(1).join('<br>')}</div>
                        </th>`;
        }).join('')}
                </tr>
            </thead>
        `;

        if (!windowed) {
            // 소·중형: 각 법조문(루트)을 독립 tbody 블록으로 — content-visibility:auto 가 화면 밖 페인트를 건너뜀.
            results.forEach(law => {
                html += `<tbody class="lq-vblock">${this.renderLawRows(law, searchText)}</tbody>`;
            });
        } else {
            // 대형(가상화): 처음 INITIAL 블록만 실제 렌더(즉시 표시='누르면 바로'), 나머지는 높이추정 placeholder.
            // 스크롤 시 mountWindowing()의 IntersectionObserver가 채움 → DOM이 작아 초기·전체 모두 가벼움.
            this.winResults = results;
            this.winSearch = searchText;
            results.forEach((law, i) => {
                if (i < LawTable.WINDOW_INITIAL) {
                    html += `<tbody class="lq-vblock" data-widx="${i}">${this.renderLawRows(law, searchText)}</tbody>`;
                } else {
                    const h = this.estBlockHeight(law);
                    html += `<tbody class="lq-vblock lq-ph" data-widx="${i}"><tr><td colspan="${this.step}"><div style="height:${h}px"></div></td></tr></tbody>`;
                }
            });
        }
        html += '</table></div>';
        return html;
    }

    /** placeholder 높이 추정(px) — 리프 행 수 기반. 정확할 필요는 없고 스크롤바 근사·관찰자 트리거용. */
    private estBlockHeight(root: LawTreeNode): number {
        const leaves = this.collectPaths(root).length || 1;
        return Math.max(56, leaves * 110);
    }

    /**
     * 윈도잉 마운트 — 렌더 후 LawView가 호출. placeholder(tbody.lq-ph)가 뷰포트에 접근하면
     * 실제 내용으로 채운다(rootMargin으로 미리 렌더 → 스크롤 시 빈칸 안 보임). 버튼 이벤트는
     * #results에 위임(delegation)되어 있어 지연 생성된 버튼도 바로 동작한다.
     */
    mountWindowing(): void {
        this.observer?.disconnect();
        this.observer = null;
        if (!this.winResults) return;                 // 윈도잉 안 한 렌더면 종료
        const host = document.getElementById('results');
        if (!host) return;
        const obs = new IntersectionObserver((entries) => {
            for (const en of entries) {
                if (!en.isIntersecting) continue;
                const tb = en.target as HTMLElement;
                obs.unobserve(tb);
                const i = parseInt(tb.dataset.widx || '-1', 10);
                if (i < 0 || !this.winResults || !this.winResults[i]) continue;
                tb.classList.remove('lq-ph');
                tb.innerHTML = this.renderLawRows(this.winResults[i], this.winSearch);
            }
        }, { root: null, rootMargin: '1400px 0px' });
        host.querySelectorAll('tbody.lq-ph').forEach(tb => obs.observe(tb));
        this.observer = obs;
    }

    /**
     * 조문 id로 본문 셀(td[data-id])을 반환 — 조문 목록(체크박스) 클릭 시 이동 대상.
     * 윈도잉 placeholder에 묻힌 조라면 그 루트 블록을 먼저 채운 뒤 다시 찾는다(관찰 해제 → 중복 렌더 방지).
     * base=a(조문 목록이 뜨는 유일한 기준)에선 루트 id === 조문 id 라 findIndex로 루트를 특정할 수 있다.
     */
    revealArticleCell(id: string): HTMLElement | null {
        const host = document.getElementById('results');
        if (!host) return null;
        const sel = `td[data-id="${(window as any).CSS?.escape ? CSS.escape(id) : id}"]`;
        let cell = host.querySelector(sel) as HTMLElement | null;
        if (cell) return cell;

        // 화면 밖(placeholder)이라 아직 렌더 안 된 조 — 해당 루트를 채운다.
        if (this.winResults) {
            const i = this.winResults.findIndex(r => String(r.id) === id);
            if (i >= 0) {
                const tb = host.querySelector(`tbody.lq-vblock[data-widx="${i}"]`) as HTMLElement | null;
                if (tb) this.mountBlock(tb);
                cell = host.querySelector(sel) as HTMLElement | null;
            }
        }
        return cell;
    }

    /**
     * 윈도잉 placeholder 블록을 실제 행으로 즉시 채운다(이미 채워졌거나 비가상화면 no-op).
     * 정적 HTML 내보내기처럼 '화면에 안 보이는 블록까지' 내용이 필요할 때 호출한다 —
     * placeholder 상태로 저장하면 빈 스페이서만 남는다.
     */
    mountBlock(tb: HTMLElement): void {
        if (!this.winResults || !tb.classList.contains('lq-ph')) return;
        const i = parseInt(tb.dataset.widx || '-1', 10);
        if (i < 0 || !this.winResults[i]) return;
        this.observer?.unobserve(tb);   // 관찰 해제 → 나중에 중복 렌더되지 않게
        tb.classList.remove('lq-ph');
        tb.innerHTML = this.renderLawRows(this.winResults[i], this.winSearch);
    }

    /** 분할 항/호 노드 id → 소속 조('A2_3h'→'A2', 'E14_2_1h'→'E14_2') + 표시 라벨. 조 자체/별표면 null. */
    private joInfo(id: string): { joId: string; label: string } | null {
        const joId = id.replace(/_\d+h(?:_.*)?$/, '');
        if (joId === id) return null;                 // 분할 자식 아님(조 자체·가지조문·별표)
        const m = joId.match(/^[AESR](\d+)(?:_(\d+))?$/);
        if (!m) return null;
        return { joId, label: `제${m[1]}조${m[2] ? '의' + m[2] : ''}` };
    }

    // ── 인용 강조(연계표): 행의 연결에 참여하는 항/호만 보이고 나머지는 흐리게 ──
    private hlIndex = new Map<string, Array<{ up: string; down: string }>>();
    private jo(id: string): string { return id ? id.replace(/_\d+h.*$/, '') : id; }
    private num(id: string): number | null {
        const m = id.match(/_(\d+)h(?:_\d+(?:_\d+)?ho)?$/); return m ? parseInt(m[1]) : null;
    }
    /** 셀(조)의 강조 단위번호 — 이 조를 '상위'로서 같은 행의 하위가 인용한 항/호만.
     *  (하위 셀을 음영하지 않음: 하위가 상위를 볼 때 상위를 강조하는 방향) */
    private computeFocus(cellId: string | null | undefined, pathJos: Set<string>): Set<number> {
        const set = new Set<number>();
        if (!cellId) return set;
        const cj = this.jo(cellId);
        if (cj !== cellId) return set;                // 이미 분할된 항/호 셀은 단일 → 음영 불필요
        for (const h of (this.hlIndex.get(cj) || [])) {
            if (this.jo(h.up) === cj && pathJos.has(this.jo(h.down))) {
                const n = this.num(h.up); if (n) set.add(n);
            }
        }
        return set;
    }
    /** 조 본문에서 focus 단위(항①②③/호1.2.3.)가 아닌 부분을 흐리게. */
    private dimUnits(text: string, focus: Set<number>): string {
        const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const HANG = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮';
        const hasHang = new RegExp(`[${HANG}]`).test(text);
        let out = '', started = false, inFocus = false;
        for (const ln of text.split('\n')) {
            const t = ln.replace(/^\s+/, '');
            const u = hasHang ? (HANG.indexOf(t[0]) >= 0 ? HANG.indexOf(t[0]) + 1 : null)
                              : (t.match(/^(\d+)\./) ? parseInt(t.match(/^(\d+)\./)![1]) : null);
            if (u !== null) { started = true; inFocus = focus.has(u); }
            const h = esc(ln) + '<br>';
            out += (!started) ? h
                 : inFocus ? `<span class="lq-hl-focus">${h}</span>`   // 강조
                           : `<span class="lq-hl-dim">${h}</span>`;     // 흐리게
        }
        return out;
    }

    private renderLawRows(root: LawTreeNode, search: string): string {
        const paths = this.collectPaths(root);
        const rowspans = this.calcRowspans(paths);

        return paths.map((path, r) => {
            // 이 행에 등장하는 조들 — 셀별 '연결에 참여하는 항/호' 판정에 사용
            const pathJos = new Set(path.filter(n => n?.id).map(n => this.jo(String(n!.id))));
            const tds = path.map((node, c) => {
                const hl = c === this.highlightCol ? ' lq-base-col' : ''; // 정렬기준 컬럼 강조
                if (rowspans[r][c] === 0) return ''; // 위 셀 rowspan에 병합됨(빈 칸·내용 공통)
                // 빈 칸도 rowspan 적용 → 한 밴드에서 빈 박스가 행마다 중복 렌더되는 것 방지(피벗 중간단 누락 시)
                if (!node) return this.emptyTd(`${LawTable.COL_CLASS[c]}${hl}`, rowspans[r][c]);

                // 분할 항/호 노드: 소속 조('제N조') 프리픽스 — 항상 표시(검색·하위규정뿐 아니라
                // 전체뷰에서도 '몇조'를 잃지 않게). 분할 안 된 조/별표는 null이라 미표시.
                let joPrefix = '';
                if (node.id && !node.isVirtual) {
                    const jo = this.joInfo(String(node.id));
                    if (jo) joPrefix = jo.label;
                }

                let extra = this.renderReferenceButton(node.id);
                if (c === 0) {
                    extra += this.renderPenaltyButton(node.id);
                }
                extra += this.renderAnnexButton(node.id); // Add newly decoupled Annex button

                // 개정 아닌 칸 표시 — 개정비교 모드(#results.lq-rev-on)에서만 CSS 가 흐린다(_revision.scss).
                const unrev = node.id && !node.isVirtual && !node.revContext && !isRevised(node) ? ' lq-unrev' : '';

                return this.td(
                    `${LawTable.COL_CLASS[c]} ${LawTable.INDENT_CLASS[c]}${hl}${unrev}`,
                    node.title,
                    node.scheduledTitle,
                    node.scheduledDate,
                    search,
                    rowspans[r][c],
                    extra,
                    node.id ?? undefined, // id를 data-id 속성으로 추가
                    node.isVirtual, // 가상 노드 여부 전달
                    joPrefix,
                    // 기준(base)보다 '위' 단계만 음영 — 기준 자신·하위는 전체표시
                    // (감독규정 기준으로 봤는데 정작 감독규정이 흐려지는 UX 방지)
                    c < this.highlightCol ? this.computeFocus(node.id, pathJos) : new Set<number>(),
                    node.cmp ?? null
                );
            }).join('');
            const cls = r === 0 && !root.id_aa ? 'title-row' : '';
            return `<tr class="${cls}">${tds}</tr>`;
        }).join('');
    }

    /**
     * 실제 단수로 맞춘다. 생성자는 URL 의 step 을 읽는데 그 값은 낡을 수 있다 —
     * 5단으로 적재했던 법령을 4단으로 다시 적재하면 예전 링크·뒤로가기에 `step=5` 가 남고,
     * 그러면 thead(names 기준)는 4칸인데 tbody 는 5칸이 되어 오른쪽에 빈 칸이 생긴다.
     * db_meta 가 준 단 수(트랙 반영)가 참이므로 렌더 전에 그것으로 덮는다.
     */
    setStep(step: number): void {
        if (!step || step === this.step) return;
        this.step = step;
        this.doc = step === 1;
        const base = (new URLSearchParams(window.location.search).get('base') || 'a').toLowerCase();
        const bi = ['a', 'e', 's', 'r', 'b'].indexOf(base);
        this.highlightCol = bi >= 0 ? Math.min(bi, step - 1) : 0;
    }

    // 헬퍼 함수들 // id를 <td>의 data-id 속성으로 추가
    private td(className: string, text: string | null, scheduledText: string | null | undefined, scheduledDate: string | null | undefined, searchText: string, rowspan?: number, extraHtml: string = '', id?: string, isVirtual?: boolean, joPrefix: string = '', focus: Set<number> = new Set(), cmp: LawCmp | null = null): string {
        const rowAttr = rowspan && rowspan > 1 ? ` rowspan="${rowspan}"` : '';
        const idAttr = id ? ` data-id="${id}"` : ''; // id를 data-id로 추가

        // 가상 노드인 경우 virtual-cell 클래스 추가
        const finalClass = isVirtual ? `${className} law-box ${this.currentTextSize} virtual-cell` : `${className} law-box ${this.currentTextSize}`;

        // 분할 항/호의 소속 조 표시(검색·하위규정뷰에서 '몇조'를 잃지 않도록)
        const pfx = joPrefix ? `<div class="lq-jo-tag small fw-bold text-secondary">${joPrefix}</div>` : '';

        // 날짜 대비: 달라진 칸·없던 칸은 대비 박스로(같은 칸은 아래 평소 경로 — title 이 이미 그날 문언이다)
        if (cmp && cmp.state !== 'same') {
            return `<td class="${finalClass}"${rowAttr}${idAttr}>${pfx}${this.formatCmp(cmp, id, searchText)}${extraHtml}</td>`;
        }

        // 문서 모드: 조 머리글 + 줄 단위 본문. 시행예정 diff 는 기존 박스 렌더가 이미 잘 보여 주므로 그대로 둔다.
        if (this.doc && !(scheduledText && scheduledText.trim())) {
            const inner = id
                ? this.docContent(text, searchText, extraHtml)
                : `<div class="lq-doc-chapter">${this.docEsc(text || '')}</div>`;   // 장·절 제목행
            return `<td class="${finalClass} lq-doc-cell"${rowAttr}${idAttr}>${pfx}${inner}</td>`;
        }

        return `<td class="${finalClass}"${rowAttr}${idAttr}>${pfx}${this.formatContent(text, scheduledText ?? null, scheduledDate ?? null, searchText, focus)}${extraHtml}</td>`;
    }
    private emptyTd(className: string, rowspan?: number): string {
        const rowAttr = rowspan && rowspan > 1 ? ` rowspan="${rowspan}"` : '';
        return `<td class="${className} law-box ${this.currentTextSize}"${rowAttr}></td>`;
    }

    /**
     * 노드를 '레벨'(컬럼)에 배치한다. 레벨 = id 접두사(A/E/S/R/B), 가상노드 'V_E_…'는 'E'.
     * 기준=법(a) 트리는 깊이==레벨이라 기존과 동일하게 동작하고,
     * 기준 전환(피벗) 트리는 루트가 시행령 등이어도 각 노드가 제 컬럼으로 들어간다.
     */
    private levelOf(node: LawTreeNode): number {
        const id = node.id;
        if (!id) return 0; // 타이틀행 등 id 없는 노드는 법 컬럼
        const s = String(id);
        const ch = (s.startsWith('V_') ? s[2] : s[0]).toUpperCase();
        const idx = ['A', 'E', 'S', 'R', 'B'].indexOf(ch);
        if (idx < 0) return 0;
        return Math.min(idx, this.step - 1);
    }

    /** leaf 경로(Path)들을 수집 */
    private collectPaths(root: LawTreeNode): Path[] {
        const paths: Path[] = [];
        const walk = (
            node: LawTreeNode,
            acc: Array<LawTreeNode | null>,
            depth: number
        ) => {
            const next = acc.slice();
            next[this.levelOf(node)] = node; // 컬럼 = 레벨(깊이 아님)
            if (!node.children?.length || depth === this.step - 1) {
                // 리프 노드이거나 최대 단계에 도달하면 경로 추가
                paths.push(next.slice(0, this.step) as Path);
                return;
            }
            node.children.forEach(child => walk(child, next, depth + 1));
        };
        walk(root, Array(this.step).fill(null), 0);
        return paths as Path[];
    }

    /** 각 열별로 ‘같은 노드가 몇 행 연속되는지’ → rowspan 배열 */
    private calcRowspans(paths: Path[]): number[][] {
        const span: number[][] = paths.map(() => Array(this.step).fill(0));
        for (let col = 0; col < this.step; col++) {
            let i = 0;
            while (i < paths.length) {
                let len = 1;
                // 같은 노드가 연속되는 경우 길이를 계산
                while (i + len < paths.length &&
                    paths[i][col] === paths[i + len][col]) len++;
                span[i][col] = len; // 블록 첫 행에만 rowspan 기록
                i += len;
            }
        }
        return span;
    }

    /////////////////////////////////

    // 벌칙 버튼 렌더링 유틸
    private renderPenaltyButton(id_a: string | null): string {
        if (id_a && this.lawView.getPenaltyIds().has(id_a)) {
            return `<button type="button" class="btn btn-outline-danger btn-sm ms-2 law-penalty-btn" data-id_a="${id_a}">
                <i class="fas fa-gavel"></i> 벌칙
            </button>`;
        }
        return '';
    }

    // 참조 버튼 렌더링 유틸
    private renderReferenceButton(id: string | null): string {
        if (!id) return '';
        const data = this.lawView.getReferenceData().get(id);
        if (!data) return '';

        let html = '';

        // 1. 텍스트 참조가 있는 경우 [참조] 버튼
        if (data.hasText) {
            html += `
            <button type="button" class="btn btn-outline-info btn-sm ms-2 law-ref-btn" data-id="${id}">참조</button>
            <div class="law-ref-popup d-none"></div>
            `;
        }

        return html;
    }

    // 새로 추가할 별표 버튼 렌더링 유틸
    private renderAnnexButton(id_src: string | null): string {
        if (id_src && this.lawView.getAnnexIds().has(id_src)) {
            return `<button type="button" class="btn btn-outline-success btn-sm ms-2 law-annex-btn" data-id_src="${id_src}">
                <i class="fas fa-file-alt"></i> 별표
            </button>`;
        }
        return '';
    }

    // Setters

    setTextSize(size: string): void {
        this.currentTextSize = size;
    }

    // ── 글자크기 변경: 재렌더 없이 반영 + 보던 조문 위치 유지 ──

    /**
     * 글자크기를 '이미 그려진 셀의 클래스 교체'로만 반영한다(재렌더 X).
     * 재렌더하면 (1) 윈도잉 placeholder가 되살아나 추정높이로 돌아가고 (2) content-visibility가
     * 기억한 블록 실측높이도 초기화돼, 같은 픽셀 y가 전혀 다른 조를 가리킨다 = "스크롤이 튄다".
     * 클래스 교체는 DOM·이벤트·윈도잉 상태를 그대로 두므로 높이 변화만 남는다.
     */
    applyTextSize(size: string): void {
        const prev = this.currentTextSize;
        this.currentTextSize = size;                 // 이후 렌더(placeholder 지연 채움 포함)에도 반영
        if (prev === size) return;
        document.getElementById('results')?.querySelectorAll('td.law-box').forEach(td => {
            if (prev) td.classList.remove(prev);     // '보통'은 빈 문자열이라 remove/add 대상 아님
            if (size) td.classList.add(size);
        });
    }

    /** sticky 요소(회원바 + thead) 아래 기준선 — 조문이 실제로 보이기 시작하는 뷰포트 y. */
    private static anchorLine(): number {
        const userbarH = parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue('--lq-userbar-h')) || 0;
        const thead = document.querySelector('.law-table thead') as HTMLElement | null;
        return userbarH + (thead ? thead.getBoundingClientRect().height : 0);
    }

    /** 기준선에 걸쳐 있는 조문 셀을 앵커로 기록. 최상단이면 null(복원 불필요). */
    captureScrollAnchor(): LawScrollAnchor | null {
        const host = document.getElementById('results');
        if (!host || window.scrollY <= 0) return null;
        const line = LawTable.anchorLine();

        // 대형 법령(수천 셀)에서 전체 스캔을 피한다 — 기준선에 걸친 블록 안에서만 셀을 본다.
        const blocks = Array.from(host.querySelectorAll('tbody.lq-vblock')) as HTMLElement[];
        const block = blocks.find(b => b.getBoundingClientRect().bottom > line);
        const cells = Array.from((block ?? host).querySelectorAll('td[data-id]')) as HTMLElement[];

        // 행은 위→아래 순서라 top은 비감소 — 기준선을 지나면 더 볼 필요 없다.
        let best: { cell: HTMLElement; rect: DOMRect } | null = null;
        for (const cell of cells) {
            const rect = cell.getBoundingClientRect();
            if (rect.bottom <= line) continue;                            // 이미 화면 위로 지나간 셀
            if (rect.top > line) { best = best ?? { cell, rect }; break; } // 기준선 아래 첫 셀
            // 기준선을 가로지르는 셀 중 가장 작은 것 = rowspan 큰 상위 셀보다 위치가 정확한 앵커
            if (!best || rect.height < best.rect.height) best = { cell, rect };
        }
        if (!best) return null;

        const ratio = best.rect.height > 0
            ? Math.min(1, Math.max(0, (line - best.rect.top) / best.rect.height))
            : 0;
        return { id: best.cell.dataset.id!, ratio };
    }

    /** 앵커 조문이 다시 기준선의 같은 자리에 오도록 스크롤 복원(픽셀이 아니라 조문 기준). */
    restoreScrollAnchor(anchor: LawScrollAnchor | null): void {
        if (!anchor) return;
        const host = document.getElementById('results');
        if (!host) return;
        const key = (window as any).CSS?.escape ? CSS.escape(anchor.id) : anchor.id;

        const align = (): void => {
            const cell = host.querySelector(`td[data-id="${key}"]`) as HTMLElement | null;
            if (!cell) return;
            const rect = cell.getBoundingClientRect();
            const y = rect.top + window.scrollY + rect.height * anchor.ratio - LawTable.anchorLine();
            window.scrollTo({ top: Math.max(0, y), behavior: 'auto' });
        };
        align();
        // 새로 화면에 들어온 블록이 실측 높이로 갱신되며 목표가 밀린다 → 다음 프레임에 한 번 더 수렴.
        requestAnimationFrame(align);
    }

    /** '20261217' → '2026. 12. 17.' (그 외 표기는 원문 그대로). */
    private static fmtEf(raw: string): string {
        const d = raw.replace(/\D/g, '');
        if (d.length !== 8) return raw;
        return `${d.slice(0, 4)}. ${Number(d.slice(4, 6))}. ${Number(d.slice(6, 8))}.`;
    }

    private docEsc(s: string): string {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    /** 문서 모드 머리글 — 규정명 + '시행 2019. 4. 1.'(연계표의 검은 단 머리 대신). */
    private docTitle(parts: string[]): string {
        const meta = parts.slice(1)
            .map(p => p.replace(/\[시행\s*(\d{8})\]/, (_m, d) => `시행 ${LawTable.fmtEf(d)}`).replace(/^\[|\]$/g, ''))
            .filter(Boolean).join(' · ');
        return `<th class="lq-doc-title"><div class="lq-doc-name">${parts[0]}</div>`
            + (meta ? `<div class="lq-doc-meta">${meta}</div>` : '') + `</th>`;
    }

    /**
     * 문서 모드 본문 — 조 제목('제2조(정의)')을 머리글로 떼어 참조·별표 버튼과 한 줄에 두고,
     * 본문은 줄마다 항(①)·호(1.)·목(가.)으로 갈라 내어쓰기한다. 개정 표기(<개정 …>)는 한 톤 낮춘다.
     */
    private docContent(text: string | null, searchText: string, tools: string): string {
        if (!text) return '';
        const hl = (s: string) => searchText
            ? s.replace(new RegExp(searchText, 'gi'), m => `<span class="text-danger fw-bold">${m}</span>`)
            : s;
        const amend = (s: string) => s.replace(
            /(&lt;(?:개정|신설|삭제|본조신설|본항신설|본호신설|본호 삭제|본조삭제|전문개정|종전)[^&]*?&gt;|\[(?:본조|본항|본호|전문|종전)[^\]]*\])/g,
            '<span class="lq-doc-amend">$1</span>');

        const lines = text.split('\n');
        const m = lines[0].match(/^(제\d+(?:-\d+)?조(?:의\d+)?(?:\s*\([^)]*\))?)\s*(.*)$/);
        const head = m ? m[1] : '';
        const body = [m ? m[2] : lines[0], ...lines.slice(1)].map(l => l.trim()).filter(Boolean);
        const deleted = !!m && /^<?\s*삭\s*제/.test(m[2].trim());

        const HANG = /^[①-⑮]/;
        const hasHang = body.some(t => HANG.test(t));
        const kind = (t: string) => HANG.test(t) ? 'hang'
            : /^\d+(?:의\d+)*\.(?!\d)/.test(t) ? 'ho'
            : /^[가-힣]\./.test(t) ? 'mok'
            : 'p';
        const rows = body.map(t => `<div class="lq-doc-ln lq-doc-${kind(t)}">${amend(hl(this.docEsc(t)))}</div>`).join('');

        const headHtml = (head || tools)
            ? `<div class="lq-doc-head"><span class="lq-doc-jo">${hl(this.docEsc(head))}</span>`
              + (tools ? `<span class="lq-doc-tools">${tools}</span>` : '') + `</div>`
            : '';
        return `<div class="lq-doc-art${deleted ? ' is-deleted' : ''}${hasHang ? '' : ' no-hang'}">`
            + `${headHtml}<div class="lq-doc-body">${rows}</div></div>`;
    }

    /** 겹쳐 쓴 박스에서 취소선을 뺀 '변경 후' 문언만 복사(LawDiffCopyEventManager 가 처리). */
    private static readonly COPY_NEW_BTN =
        '<button type="button" class="lq-copy-new" title="취소선 없이 변경 후 문언만 복사">'
        + '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="5" width="9" height="9" rx="1.5"/>'
        + '<path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5"/></svg>'
        + '변경 후 복사</button>';

    /**
     * 날짜 대비 박스 — 옛 날짜 → 새 날짜 문언을 한 칸 안에 겹쳐 쓴다(시행예정 겹쳐 보기와 같은 약속:
     * <del class="law-del"> 사라진 문언, <ins class="law-ins"> 들어온 문언). 변경 칸엔 '크게 보기'(신구 2단 창).
     */
    private formatCmp(cmp: LawCmp, id: string | undefined, searchText: string): string {
        const hl = (s: string): string => searchText
            ? s.replace(new RegExp(searchText, 'gi'), m => `<span class="text-danger fw-bold">${m}</span>`)
            : s;
        const show = (s: string): string => hl(this.docEsc(s)).replace(/\n/g, '<br>');
        if (cmp.state === 'absent') {
            return '<div class="box-item small p-2 m-0 lq-cmp-absent">이 시점엔 없던 조문</div>';
        }
        let inner = '';
        if (cmp.state === 'added') inner = `<ins class="law-ins">${show(cmp.newer ?? '')}</ins>`;
        else if (cmp.state === 'removed') inner = `<del class="law-del">${show(cmp.older ?? '')}</del>`;
        else {
            const { diff_match_patch, DIFF_DELETE, DIFF_INSERT } = require('diff-match-patch');
            const dmp = new diff_match_patch();
            const diffs = dmp.diff_main(cmp.older ?? '', cmp.newer ?? '');
            dmp.diff_cleanupSemantic(diffs);
            for (const [op, data] of diffs as [number, string][]) {
                const seg = show(data);
                inner += op === DIFF_DELETE ? `<del class="law-del">${seg}</del>`
                    : op === DIFF_INSERT ? `<ins class="law-ins">${seg}</ins>` : seg;
            }
        }
        const label = cmp.state === 'added' ? '신설' : cmp.state === 'removed' ? '삭제' : '변경';
        const zoom = id && cmp.state === 'changed'
            ? `<button type="button" class="lq-cmp-zoom" data-id="${id}">크게 보기</button>` : '';
        const copy = cmp.state === 'removed' ? '' : LawTable.COPY_NEW_BTN;
        return `<div class="box-item small p-2 m-0 box-item--cmp lq-cmp-${cmp.state}">`
            + `<div class="lq-cmp-tag"><span class="lq-cmp-chip">${label}</span>${zoom}${copy}</div>${inner}</div>`;
    }

    private formatContent(text: string | null, scheduledText: string | null, scheduledDate: string | null, searchText: string, focus: Set<number> = new Set()): string {
        const highlight = (s: string): string => {
            if (!searchText) return s;
            return s.replace(new RegExp(searchText, 'gi'),
                match => `<span class="text-danger fw-bold">${match}</span>`);
        };

        const parts: string[] = [];

        if (text) {
            // 연계 강조: 행의 연결에 참여하는 항/호만 보이고 나머지는 흐리게(검색 중엔 비활성)
            const c = (focus.size && !searchText)
                ? this.dimUnits(text, focus)
                : highlight(text).replace(/\n/g, '<br>');
            parts.push(`<div class="box-item small p-2 m-0">${c}</div>`);
        }

        if (scheduledText && scheduledText.trim()) {
            let inner: string;
            if (text) {
                // 시행예정 박스 안에 현행 → 시행예정 인라인 diff(<del>=사라진 문언, <ins>=들어온 문언).
                const { diff_match_patch, DIFF_DELETE, DIFF_INSERT } = require('diff-match-patch');
                const dmp = new diff_match_patch();
                const diffs = dmp.diff_main(text, scheduledText);
                dmp.diff_cleanupSemantic(diffs);

                inner = '';
                for (const [op, data] of diffs as [number, string][]) {
                    const seg = highlight(data).replace(/\n/g, '<br>');
                    if (op === DIFF_DELETE) {
                        inner += `<del class="law-del">${seg}</del>`;
                    } else if (op === DIFF_INSERT) {
                        inner += `<ins class="law-ins">${seg}</ins>`;
                    } else {
                        inner += seg;
                    }
                }
            } else {
                inner = highlight(scheduledText).replace(/\n/g, '<br>');
            }
            const when = scheduledDate ? LawTable.fmtEf(scheduledDate) : '';
            const schedLabel = when ? `시행예정 ${when}` : '시행예정';
            // 버튼·시행예정 표시는 본문 아래 별도 줄(겹치지 않게 흐름 안에 둔다)
            const foot = `<div class="lq-sched-foot">${LawTable.COPY_NEW_BTN}<span class="lq-sched-label">${schedLabel}</span></div>`;
            parts.push(`<div class="box-item small p-2 m-0 box-item--scheduled">${inner}${foot}</div>`);
        }

        return parts.join('');
    }
}