import { LawResult } from '../../types/LawResult';
import { LawTitle } from '../../types/LawTitle';
import { LawTreeNode } from '../../types/LawTreeNode';
import { LawView } from '../LawView';

export class LawTable {

    // Test
    private lawView: LawView;

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
        results.forEach(law => {
            html += this.renderLawRows(law, searchText);
        });
        html += '</tbody></table></div>';
        return html;
    }
    
    // renderLawRow는 html을 반환하도록!
    // 계층 구조를 4단 표로 렌더링 (rowspan 중복 없이)
    // private renderLawRows(
    //     law: LawTreeNode,
    //     searchText: string
    // ): string {
    //     let html = '';
    //     const lawRowspan = this.countLeaf(law);

    //     // id_a가 없으면 타이틀 행으로 간주
    //     const rowClass = !law.id_aa ? 'title-row' : '';        
    
    //     if (!law.children || law.children.length === 0) {
    //         // 조문만 있는 경우 : rowClass는 여기에만 적용해도 됨
    //         html += `<tr class="${rowClass}"> 
    //             <td class="law-title law-box ${this.currentTextSize}">
    //                 ${this.formatContent(law.title, searchText)}
    //                 ${this.renderPenaltyButton(law.id)}
    //             </td>
    //             <td class="decree-title law-box tree-indent-1 ${this.currentTextSize}"></td>
    //             <td class="regulation-title law-box tree-indent-2 ${this.currentTextSize}"></td>
    //             <td class="rule-title law-box tree-indent-3 ${this.currentTextSize}"></td>
    //         </tr>`;
    //         return html;
    //     }
    
    //     law.children.forEach((decree, i) => {
    //         const decreeRowspan = this.countLeaf(decree);
    //         if (!decree.children || decree.children.length === 0) {
    //             // 시행령까지만 있는 경우
    //             html += `<tr>
    //                 ${i === 0 ? `<td class="law-title law-box ${this.currentTextSize}" rowspan="${lawRowspan}">
    //                     ${this.formatContent(law.title, searchText)}
    //                     ${this.renderPenaltyButton(law.id)}
    //                 </td>` : ''}
    //                 <td class="decree-title law-box tree-indent-1 ${this.currentTextSize}">${this.formatContent(decree.title, searchText)}</td>
    //                 <td class="regulation-title law-box tree-indent-2 ${this.currentTextSize}"></td>
    //                 <td class="rule-title law-box tree-indent-3 ${this.currentTextSize}"></td>
    //             </tr>`;
    //             return;
    //         }
    //         decree.children.forEach((regulation, j) => {
    //             const regulationRowspan = this.countLeaf(regulation);
    //             if (!regulation.children || regulation.children.length === 0) {
    //                 // 감독규정까지만 있는 경우
    //                 html += `<tr>
    //                     ${i === 0 && j === 0 ? `<td class="law-title law-box ${this.currentTextSize}" rowspan="${lawRowspan}">
    //                         ${this.formatContent(law.title, searchText)}
    //                         ${this.renderPenaltyButton(law.id)}
    //                     </td>` : ''}
    //                     ${j === 0 ? `<td class="decree-title law-box tree-indent-1 ${this.currentTextSize}" rowspan="${decreeRowspan}">${this.formatContent(decree.title, searchText)}</td>` : ''}
    //                     <td class="regulation-title law-box tree-indent-2 ${this.currentTextSize}">${this.formatContent(regulation.title, searchText)}</td>
    //                     <td class="rule-title law-box tree-indent-3 ${this.currentTextSize}"></td>
    //                 </tr>`;
    //                 return;
    //             }
    //             regulation.children.forEach((rule, k) => {
    //                 // 시행세칙까지 있는 경우
    //                 html += `<tr>
    //                     ${i === 0 && j === 0 && k === 0 ? `<td class="law-title law-box ${this.currentTextSize}" rowspan="${lawRowspan}">
    //                         ${this.formatContent(law.title, searchText)}
    //                         ${this.renderPenaltyButton(law.id)}
    //                     </td>` : ''}
    //                     ${j === 0 && k === 0 ? `<td class="decree-title law-box tree-indent-1 ${this.currentTextSize}" rowspan="${decreeRowspan}">${this.formatContent(decree.title, searchText)}</td>` : ''}
    //                     ${k === 0 ? `<td class="regulation-title law-box tree-indent-2 ${this.currentTextSize}" rowspan="${regulationRowspan}">${this.formatContent(regulation.title, searchText)}</td>` : ''}
    //                     <td class="rule-title law-box tree-indent-3 ${this.currentTextSize}">${this.formatContent(rule.title, searchText)}</td>
    //                 </tr>`;
    //             });
    //         });
    //     });
    //     return html;
    // }

    private renderLawRows(
        law: LawTreeNode,
        searchText: string
    ): string {
        let html = '';
        const lawRowspan = this.countLeaf(law);
        const rowClass = !law.id_aa ? 'title-row' : '';
    
        // 조문만 있는 경우
        if (!law.children || law.children.length === 0) {
            html += this.renderRow({
                rowClass,
                lawTd: this.td('law-title', 
                    law.title, 
                    searchText, 
                    lawRowspan, 
                    // this.renderPenaltyButton(law.id)
                    this.renderPenaltyButton(law.id) + this.renderReferenceButton(law.id)
                ),
                decreeTd: this.emptyTd('decree-title'),
                regulationTd: this.emptyTd('regulation-title'),
                ruleTd: this.emptyTd('rule-title')
            });
            return html;
        }
    
        law.children.forEach((decree, i) => {
            const decreeRowspan = this.countLeaf(decree);
            // 시행령까지만 있는 경우
            if (!decree.children || decree.children.length === 0) {
                html += this.renderRow({
                    rowClass: '',
                    lawTd: i === 0 ? this.td('law-title', 
                        law.title, 
                        searchText, 
                        lawRowspan, 
                        //this.renderPenaltyButton(law.id)
                        this.renderPenaltyButton(law.id) + this.renderReferenceButton(law.id)
                    ) : '',
                    decreeTd: this.td('decree-title', decree.title, searchText),
                    regulationTd: this.emptyTd('regulation-title'),
                    ruleTd: this.emptyTd('rule-title')
                });
                return;
            }
            decree.children.forEach((regulation, j) => {
                const regulationRowspan = this.countLeaf(regulation);
                // 감독규정까지만 있는 경우
                if (!regulation.children || regulation.children.length === 0) {
                    html += this.renderRow({
                        rowClass: '',
                        lawTd: i === 0 && j === 0 ? this.td('law-title', 
                            law.title, 
                            searchText, 
                            lawRowspan, 
                            //this.renderPenaltyButton(law.id)
                            this.renderPenaltyButton(law.id) + this.renderReferenceButton(law.id)
                        ) : '',
                        decreeTd: j === 0 ? this.td('decree-title', decree.title, searchText, decreeRowspan) : '',
                        regulationTd: this.td('regulation-title', regulation.title, searchText),
                        ruleTd: this.emptyTd('rule-title')
                    });
                    return;
                }
                regulation.children.forEach((rule, k) => {
                    html += this.renderRow({
                        rowClass: '',
                        lawTd: i === 0 && j === 0 && k === 0 ? this.td('law-title', 
                            law.title, 
                            searchText, 
                            lawRowspan, 
                            //this.renderPenaltyButton(law.id)
                            this.renderPenaltyButton(law.id) + this.renderReferenceButton(law.id)
                        ) : '',
                        decreeTd: j === 0 && k === 0 ? this.td('decree-title', decree.title, searchText, decreeRowspan) : '',
                        regulationTd: k === 0 ? this.td('regulation-title', regulation.title, searchText, regulationRowspan) : '',
                        ruleTd: this.td('rule-title', rule.title, searchText)
                    });
                });
            });
        });
        return html;
    }
    
    // 헬퍼 함수들
    private td(className: string, text: string | null, searchText: string, rowspan?: number, extraHtml: string = ''): string {
        const rowAttr = rowspan && rowspan > 1 ? ` rowspan="${rowspan}"` : '';
        return `<td class="${className} law-box ${this.currentTextSize}"${rowAttr}>${this.formatContent(text, searchText)}${extraHtml}</td>`;
    }
    private emptyTd(className: string): string {
        return `<td class="${className} law-box ${this.currentTextSize}"></td>`;
    }
    private renderRow({ rowClass = '', lawTd = '', decreeTd = '', regulationTd = '', ruleTd = '' }): string {
        return `<tr class="${rowClass}">${lawTd}${decreeTd}${regulationTd}${ruleTd}</tr>`;
    }


    // leaf(시행세칙) 개수 세기
    private countLeaf(node: LawTreeNode): number {
        if (!node.children || node.children.length === 0) return 1;
        return node.children.reduce((sum, child) => sum + this.countLeaf(child), 0);
    }

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
            <span style="position:relative;display:inline-block;">
                <button type="button" class="btn btn-outline-info btn-sm ms-2 law-ref-btn" data-id="${id}">참조</button>
                <div class="law-ref-popup d-none" style="
                    position:absolute; left:0; top:110%; z-index:1000; min-width:200px; max-width:400px;
                    background:#fff; border:1px solid #ccc; border-radius:4px; box-shadow:0 2px 8px rgba(0,0,0,0.15);
                    padding:8px; font-size:0.95em; white-space:pre-line;
                "></div>
            </span>
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