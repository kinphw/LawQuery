// import { LawResult } from '../../types/LawResult';
import { LawTitle } from '../../types/LawTitle';
import { LawTreeNode } from '../../types/LawTreeNode';
import { LawView } from '../LawView';

type Path = [
    LawTreeNode | null, LawTreeNode | null,
    LawTreeNode | null, LawTreeNode | null];

export class LawTable {

    // Test
    private lawView: LawView;
    private step: number;

    // 법령명 thead 설정을 위한 클래스변수 // 250623
    public names: string[] = [];

    // 0: 법 / 1: 시행령 / 2: 감독규정 / 3: 세칙
    private static readonly COL_CLASS = [
        'law-title', 'decree-title', 'regulation-title', 'rule-title'
    ] as const;
    private static readonly INDENT_CLASS = [
        '', 'tree-indent-1', 'tree-indent-2', 'tree-indent-3'
    ] as const;

    // constructor(lawView: LawView) {
    //     this.lawView = lawView; // Dependency injection
    // }


    constructor(lawView: LawView) {
        this.lawView = lawView; // Dependency injection

        // URL에서 law 파라미터 읽기
        const urlParams = new URLSearchParams(window.location.search);
        const law = urlParams.get('law') || 'j'; // 기본값: 'j'

        // law 값에 따라 names 초기화
        if (law === 'j') {
            this.names = [
                '전자금융거래법\n[시행 2024. 9. 15.]\n[법률 제19734호, 2023. 9. 14., 일부개정]',
                '전자금융거래법 시행령\n[시행 2024. 12. 27.]\n[대통령령 제35038호, 2024. 12. 3., 타법개정]',
                '전자금융감독규정\n[시행 2025. 2. 5.]\n[금융위원회고시 제2025-4호, 2025. 2. 5., 일부개정]',
                '전자금융감독규정시행세칙\n[시행 2025. 2. 5.]\n[금융감독원세칙 , 2025. 2. 3., 일부개정]'
            ];
        } else if (law === 'y') {
            this.names = [
                '여신전문금융업법\n[시행 2025. 4. 22.]\n[법률 제20716호, 2025. 1. 21., 일부개정]',
                '여신전문금융업법 시행령\n[시행 2024. 12. 10.]\n[대통령령 제35064호, 2024. 12. 10., 일부개정]',
                '여신전문금융업법 시행규칙\n[시행 2020. 8. 5.]\n[총리령 제1635호, 2020. 8. 5., 타법개정]',
                '여신전문금융업감독규정\n[시행 2025. 2. 14.]\n[금융위원회고시 제2025-3호, 2025. 2. 5., 일부개정]',
                '여신전문금융업감독업무시행세칙\n[시행 2024. 6. 28.]\n[금융감독원세칙 , 2024. 6. 28., 일부개정]'
            ]
        }

        this.step = parseInt(urlParams.get('step') || '4', 10); // 기본값: 4단계

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

        let html = '<div><table class="table table-bordered law-table">';
        html += `
            <thead class="table-dark sticky-top">
                <tr>
                    ${this.names.slice(0, this.step).map(name => {
            const parts = name.split('\n');
            return `<th class="text-center py-1">
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

    private renderLawRows(root: LawTreeNode, search: string): string {
        const paths = this.collectPaths(root);
        const rowspans = this.calcRowspans(paths);

        return paths.map((path, r) => {
            const tds = path.map((node, c) => {
                if (!node) return this.emptyTd(LawTable.COL_CLASS[c]);
                if (rowspans[r][c] === 0) return ''; // rowspan이 0인 경우 빈 셀
                let extra = this.renderReferenceButton(node.id);
                if (c === 0) {
                    extra += this.renderPenaltyButton(node.id);
                }
                return this.td(
                    `${LawTable.COL_CLASS[c]} ${LawTable.INDENT_CLASS[c]}`,
                    node.title, search,
                    rowspans[r][c],
                    extra,
                    node.id ?? undefined, // id를 data-id 속성으로 추가
                    node.isVirtual // 가상 노드 여부 전달
                );
            }).join('');
            const cls = r === 0 && !root.id_aa ? 'title-row' : '';
            return `<tr class="${cls}">${tds}</tr>`;
        }).join('');
    }

    // 헬퍼 함수들 // id를 <td>의 data-id 속성으로 추가
    private td(className: string, text: string | null, searchText: string, rowspan?: number, extraHtml: string = '', id?: string, isVirtual?: boolean): string {
        const rowAttr = rowspan && rowspan > 1 ? ` rowspan="${rowspan}"` : '';
        const idAttr = id ? ` data-id="${id}"` : ''; // id를 data-id로 추가

        // 가상 노드인 경우 virtual-cell 클래스 추가
        const finalClass = isVirtual ? `${className} law-box ${this.currentTextSize} virtual-cell` : `${className} law-box ${this.currentTextSize}`;

        return `<td class="${finalClass}"${rowAttr}${idAttr}>${this.formatContent(text, searchText)}${extraHtml}</td>`;
    }
    private emptyTd(className: string): string {
        return `<td class="${className} law-box ${this.currentTextSize}"></td>`;
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
            next[depth] = node;
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

        // 2. 별표 링크가 있는 경우 [별표] 버튼들
        if (data.annexes && data.annexes.length > 0) {
            data.annexes.forEach((annexUrl, index) => {
                // 별표 이름 추출 로직이 필요할 수 있음. URL에서 추출하거나, 그냥 순번으로.
                // URL 예: https://www.law.go.kr/...
                // 간단히 [별표] 또는 [별표1] 등으로 표시.
                // 링크는 새 창으로 열리도록.
                html += `<a href="${annexUrl}" target="_blank" class="btn btn-outline-success btn-sm ms-1 law-annex-btn" style="text-decoration:none;">
                    <i class="fas fa-file-alt"></i> 별표${data.annexes.length > 1 ? index + 1 : ''}
                 </a>`;
            });
        }
        return html;
    }

    // Setters

    setTextSize(size: string): void {
        this.currentTextSize = size;
    }

    // formatContent는 box-item만 남기고 단일 텍스트만 감싸도록
    private formatContent(text: string | null, searchText: string): string {
        if (!text) return '';
        let content = text;
        if (searchText) {
            content = content.replace(new RegExp(searchText, 'gi'),
                match => `<span class="text-danger fw-bold">${match}</span>`);
        }
        return `<div class="box-item small p-2 m-0">${content.replace(/\n/g, '<br>')}</div>`;
    }
}