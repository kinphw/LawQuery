// import { LawResult } from '../../types/LawResult';
import { LawTitle } from '../../types/LawTitle';
import { LawTreeNode } from '../../types/LawTreeNode';
import { LawView } from '../LawView';
import { getLawConfig } from '../../config/LawConfig';

type Path = [
    LawTreeNode | null, LawTreeNode | null,
    LawTreeNode | null, LawTreeNode | null, LawTreeNode | null];

export class LawTable {

    // Test
    private lawView: LawView;
    private step: number;
    // 현재 정렬기준(base)에 해당하는 컬럼 인덱스 → 해당 열을 강조 표시
    private highlightCol: number;

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

        let html = '<div class="table-responsive law-table-wrap"><table class="table table-bordered law-table">';
        html += `
            <thead class="table-dark sticky-top">
                <tr>
                    ${this.names.slice(0, this.step).map((name, i) => {
            const parts = name.split('\n');
            const hl = i === this.highlightCol ? ' lq-base-col' : '';
            return `<th class="text-center py-1${hl}">
                            <div class="small">${parts[0]}</div>
                            <div class="text-xs">${parts.slice(1).join('<br>')}</div>
                        </th>`;
        }).join('')}
                </tr>
            </thead>
        `;

        html += '<tbody>';
        results.forEach(law => {
            html += this.renderLawRows(law, searchText);
        });
        html += '</tbody></table></div>';
        return html;
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

                return this.td(
                    `${LawTable.COL_CLASS[c]} ${LawTable.INDENT_CLASS[c]}${hl}`,
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
                    c < this.highlightCol ? this.computeFocus(node.id, pathJos) : new Set<number>()
                );
            }).join('');
            const cls = r === 0 && !root.id_aa ? 'title-row' : '';
            return `<tr class="${cls}">${tds}</tr>`;
        }).join('');
    }

    // 헬퍼 함수들 // id를 <td>의 data-id 속성으로 추가
    private td(className: string, text: string | null, scheduledText: string | null | undefined, scheduledDate: string | null | undefined, searchText: string, rowspan?: number, extraHtml: string = '', id?: string, isVirtual?: boolean, joPrefix: string = '', focus: Set<number> = new Set()): string {
        const rowAttr = rowspan && rowspan > 1 ? ` rowspan="${rowspan}"` : '';
        const idAttr = id ? ` data-id="${id}"` : ''; // id를 data-id로 추가

        // 가상 노드인 경우 virtual-cell 클래스 추가
        const finalClass = isVirtual ? `${className} law-box ${this.currentTextSize} virtual-cell` : `${className} law-box ${this.currentTextSize}`;

        // 분할 항/호의 소속 조 표시(검색·하위규정뷰에서 '몇조'를 잃지 않도록)
        const pfx = joPrefix ? `<div class="lq-jo-tag small fw-bold text-secondary">${joPrefix}</div>` : '';

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

        if (scheduledText) {
            let inner: string;
            if (text) {
                // 현행과 비교해 시행예정 박스 안에서 diff 표시
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
            const schedLabel = scheduledDate ? `시행예정 ${scheduledDate}` : '시행예정';
            parts.push(`<div class="box-item small p-2 m-0 box-item--scheduled" data-sched-label="${schedLabel}">${inner}</div>`);
        }

        return parts.join('');
    }
}