import { LawResult } from '../../types/LawResult';
import { LawTitle } from '../../types/LawTitle';
import { LawTreeNode } from '../../types/LawTreeNode';
import { LawView } from '../LawView';

type Path = [
    LawTreeNode | null, LawTreeNode | null,
    LawTreeNode | null, LawTreeNode | null];

export class LawTable {
    
    // Test
    private lawView: LawView;    

    // 0: 법 / 1: 시행령 / 2: 감독규정 / 3: 세칙
    private static readonly COL_CLASS = [
        'law-title', 'decree-title', 'regulation-title', 'rule-title'
    ] as const;
    private static readonly INDENT_CLASS = [
        '', 'tree-indent-1', 'tree-indent-2', 'tree-indent-3'
    ] as const;

    constructor(lawView: LawView) {
        this.lawView = lawView; // Dependency injection
    }

    // 법령명 thead 설정을 위한 클래스변수
    public names : string[] = [
        '전자금융거래법\n[시행 2024. 9. 15.]\n[법률 제19734호, 2023. 9. 14., 일부개정]',
        '전자금융거래법 시행령\n[시행 2024. 12. 27.]\n[대통령령 제35038호, 2024. 12. 3., 타법개정]',
        '전자금융감독규정\n[시행 2025. 2. 5.]\n[금융위원회고시 제2025-4호, 2025. 2. 5., 일부개정]',
        '전자금융감독규정시행세칙\n[시행 2025. 2. 5.]\n[금융감독원세칙 , 2025. 2. 3., 일부개정]'
    ]

    private currentTextSize: string = ''; // Add text size state


    render(results: LawTreeNode[], searchText: string = ''): string {
        if (!results.length) {
            return '<div class="alert alert-warning">표시할 법령이 없습니다.</div>';
        }
    
        let html = '<div><table class="table table-bordered law-table">';
        html += `
            <thead class="table-dark sticky-top">
                <tr>
                    ${this.names.map(name => {
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
        // 각 법령에 대해 순환하면서 LawRows를 렌더링
        results.forEach(law => {
            html += this.renderLawRows(law, searchText);
        });
        html += '</tbody></table></div>';
        return html;
    }

    private renderLawRows(root: LawTreeNode, search: string): string {
        const paths    = this.collectPaths(root);
        const rowspans = this.calcRowspans(paths);
      
        return paths
          .map((path, r) => {
            const tds = path.map((node, c) => {
              if (!node) return this.emptyTd(LawTable.COL_CLASS[c]);   // 빈 깊이
              if (rowspans[r][c] === 0) return '';                     // rowspan으로 병합
            //   const extra = c === 0                                       // 0열(법)만 버튼
            //     ? this.renderPenaltyButton(node.id) + this.renderReferenceButton(node.id)
            //     : '';
              // 모든 단계에서 참조 버튼 추가
              let extra = this.renderReferenceButton(node.id);
              if (c === 0) {
                  // 법 단계에서만 벌칙 버튼 추가
                  extra += this.renderPenaltyButton(node.id);
              }

              return this.td(
                `${LawTable.COL_CLASS[c]} ${LawTable.INDENT_CLASS[c]}`,
                node.title, search,
                rowspans[r][c],
                extra
              );
            }).join('');
            // 법령 제목 열이 있는 첫 행에만 title-row 부여
            const cls = r === 0 && !root.id_aa ? 'title-row' : '';
            return `<tr class="${cls}">${tds}</tr>`;
          })
          .join('');
      }    
    
    // 헬퍼 함수들
    private td(className: string, text: string | null, searchText: string, rowspan?: number, extraHtml: string = ''): string {
        const rowAttr = rowspan && rowspan > 1 ? ` rowspan="${rowspan}"` : '';
        return `<td class="${className} law-box ${this.currentTextSize}"${rowAttr}>${this.formatContent(text, searchText)}${extraHtml}</td>`;
    }
    private emptyTd(className: string): string {
        return `<td class="${className} law-box ${this.currentTextSize}"></td>`;
    }

    /** leaf 경로(Path)들을 수집 ── 깊이는 4단으로 고정 */
    private collectPaths(root: LawTreeNode): Path[] {
        const paths: Path[] = [];
        const walk = (
        node: LawTreeNode,
        acc: [LawTreeNode | null, LawTreeNode | null,
                LawTreeNode | null, LawTreeNode | null]
        ) => {
        const [law, dec, reg] = acc;
        const next: Path = [
            law ?? node,
            law && !dec ? node : dec,
            dec && !reg ? node : reg,
            reg ? node : null,
        ];
        if (!node.children?.length) {
            paths.push(next);
            return;
        }
        node.children.forEach(child => walk(child, next));
        };
        walk(root, [null, null, null, null]);
        return paths;
    }
    
    /** 각 열별로 ‘같은 노드가 몇 행 연속되는지’ → rowspan 배열 */
    private calcRowspans(paths: Path[]): number[][] {
        const span: number[][] = paths.map(_ => [0, 0, 0, 0]);
        for (let col = 0; col < 4; col++) {
        let i = 0;
        while (i < paths.length) {
            let len = 1;
            while (i + len < paths.length &&
                paths[i][col] === paths[i + len][col]) len++;
            span[i][col] = len;           // 블록 첫 행에만 기록
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
        if (!id || !this.lawView.getReferenceIds().has(id)) return '';
        return `
            <button type="button" class="btn btn-outline-info btn-sm ms-2 law-ref-btn" data-id="${id}">참조</button>
            <div class="law-ref-popup d-none"></div>
        `;
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