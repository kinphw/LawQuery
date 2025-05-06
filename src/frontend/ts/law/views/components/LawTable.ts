import { LawResult } from '../../types/LawResult';
import { LawTitle } from '../../types/LawTitle';
import { LawTreeNode } from '../../types/LawTreeNode';

export class LawTable {

  // 법령명 thead 설정을 위한 클래스변수수  
    public names : string[] = [
        '전자금융거래법\n[시행 2024. 9. 15.]\n[법률 제19734호, 2023. 9. 14., 일부개정]',
        '전자금융거래법 시행령\n[시행 2024. 12. 27.]\n[대통령령 제35038호, 2024. 12. 3., 타법개정]',
        '전자금융감독규정\n[시행 2025. 2. 5.]\n[금융위원회고시 제2025-4호, 2025. 2. 5., 일부개정]',
        '전자금융감독규정시행세칙\n[시행 2025. 2. 5.]\n[금융감독원세칙 , 2025. 2. 3., 일부개정]'
    ]

    // private currentTextSize: string = 'small'; // Add text size state
    private currentTextSize: string = ''; // Add text size state

    private lawIds: string[] = []; // 조문 ID 목록 저장

    private penaltyIds: Set<string> = new Set(); // 벌칙 ID 목록 저장

    public setPenaltyIds(penaltyIds: string[]): void {
        this.penaltyIds = new Set(penaltyIds);
    };

    renderLawCheckboxes(laws: Array<LawTitle>): string {
        this.lawIds = laws.filter(law => !law.isTitle).map(law => law.id_a!);
        
        return laws.map(law => {
            if (law.isTitle) {
                return `
                    <div class="form-check w-100 title-row">
                        <span class="fw-bold small bg-light d-block px-2 py-1">${law.title_a}</span>
                    </div>
                `;
            }
            return `
                <div class="form-check w-100 ps-4">
                    <input class="form-check-input" type="checkbox" value="${law.id_a}" id="law${law.id_a}">
                    <label class="form-check-label small" for="law${law.id_a}">
                        ${law.title_a}
                    </label>
                </div>
            `;
        }).join('');
    }    

    // render(results: LawResult[], searchText: string = ''): string {
    // render(results: LawTreeNode[], searchText: string = ''): string {    
    //     if (!results.length) {
    //         return '<div class="alert alert-warning">표시할 법령이 없습니다.</div>';
    //     }

    //     let html = '<div><table class="table table-bordered law-table">';
        
    //     // 헤더 - names 배열 활용
    //     html += `
    //         <thead class="table-dark sticky-top">
    //             <tr>
    //                 ${this.names.map(name => {
    //                     const parts = name.split('\n');
    //                     return `<th class="text-center py-1">
    //                         <div class="small">${parts[0]}</div>
    //                         <div class="text-xs">${parts.slice(1).join('<br>')}</div>
    //                     </th>`;
    //                 }).join('')}
    //             </tr>
    //         </thead>`;

    //         // ${this.names.map(name => 
    //         //     `<th class="text-center small fw-bold py-1">${name.replace(/\n/g, '<br>')}</th>`
    //         // ).join('')}

    //     // Modified tbody rendering
    //     html += '<tbody>';
    //     results.forEach(row => {
    //         // Add title-row class if id_a is null
    //         const rowClass = row.id_a === null ? 'title-row' : '';
    //         html += `<tr class="${rowClass}">`;
    //         ['law_content', 'decree_content', 'regulation_content', 'rule_content'].forEach(col => {
    //             html += `<td class="${this.currentTextSize} p-2 m-0 ${rowClass}">
    //                 ${this.formatContent(row[col], searchText)}</td>`;
    //         });
    //         html += '</tr>';
    //     });
    //     html += '</tbody></table></div>';

    //     return html;
    // }

    render(results: LawTreeNode[], searchText: string = '', penaltyIds: string[] = []): string {
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
    private renderLawRows(
        law: LawTreeNode,
        searchText: string
    ): string {
        let html = '';
        const lawRowspan = this.countLeaf(law);

        // id_a가 없으면 타이틀 행으로 간주
        const rowClass = !law.id_aa ? 'title-row' : '';        
    
        if (!law.children || law.children.length === 0) {
            // 조문만 있는 경우 : rowClass는 여기에만 적용해도 됨
            html += `<tr class="${rowClass}"> 
                <td class="law-title law-box ${this.currentTextSize}">
                    ${this.formatContent(law.title, searchText)}
                    ${this.renderPenaltyButton(law.id)}
                </td>
                <td class="decree-title law-box tree-indent-1 ${this.currentTextSize}"></td>
                <td class="regulation-title law-box tree-indent-2 ${this.currentTextSize}"></td>
                <td class="rule-title law-box tree-indent-3 ${this.currentTextSize}"></td>
            </tr>`;
            return html;
        }
    
        law.children.forEach((decree, i) => {
            const decreeRowspan = this.countLeaf(decree);
            if (!decree.children || decree.children.length === 0) {
                // 시행령까지만 있는 경우
                html += `<tr>
                    ${i === 0 ? `<td class="law-title law-box ${this.currentTextSize}" rowspan="${lawRowspan}">
                        ${this.formatContent(law.title, searchText)}
                        ${this.renderPenaltyButton(law.id)}
                    </td>` : ''}
                    <td class="decree-title law-box tree-indent-1 ${this.currentTextSize}">${this.formatContent(decree.title, searchText)}</td>
                    <td class="regulation-title law-box tree-indent-2 ${this.currentTextSize}"></td>
                    <td class="rule-title law-box tree-indent-3 ${this.currentTextSize}"></td>
                </tr>`;
                return;
            }
            decree.children.forEach((regulation, j) => {
                const regulationRowspan = this.countLeaf(regulation);
                if (!regulation.children || regulation.children.length === 0) {
                    // 감독규정까지만 있는 경우
                    html += `<tr>
                        ${i === 0 && j === 0 ? `<td class="law-title law-box ${this.currentTextSize}" rowspan="${lawRowspan}">
                            ${this.formatContent(law.title, searchText)}
                            ${this.renderPenaltyButton(law.id)}
                        </td>` : ''}
                        ${j === 0 ? `<td class="decree-title law-box tree-indent-1 ${this.currentTextSize}" rowspan="${decreeRowspan}">${this.formatContent(decree.title, searchText)}</td>` : ''}
                        <td class="regulation-title law-box tree-indent-2 ${this.currentTextSize}">${this.formatContent(regulation.title, searchText)}</td>
                        <td class="rule-title law-box tree-indent-3 ${this.currentTextSize}"></td>
                    </tr>`;
                    return;
                }
                regulation.children.forEach((rule, k) => {
                    // 시행세칙까지 있는 경우
                    html += `<tr>
                        ${i === 0 && j === 0 && k === 0 ? `<td class="law-title law-box ${this.currentTextSize}" rowspan="${lawRowspan}">
                            ${this.formatContent(law.title, searchText)}
                            ${this.renderPenaltyButton(law.id)}
                        </td>` : ''}
                        ${j === 0 && k === 0 ? `<td class="decree-title law-box tree-indent-1 ${this.currentTextSize}" rowspan="${decreeRowspan}">${this.formatContent(decree.title, searchText)}</td>` : ''}
                        ${k === 0 ? `<td class="regulation-title law-box tree-indent-2 ${this.currentTextSize}" rowspan="${regulationRowspan}">${this.formatContent(regulation.title, searchText)}</td>` : ''}
                        <td class="rule-title law-box tree-indent-3 ${this.currentTextSize}">${this.formatContent(rule.title, searchText)}</td>
                    </tr>`;
                });
            });
        });
        return html;
    }
    // leaf(시행세칙) 개수 세기
    private countLeaf(node: LawTreeNode): number {
        if (!node.children || node.children.length === 0) return 1;
        return node.children.reduce((sum, child) => sum + this.countLeaf(child), 0);
    }

    // 벌칙 버튼 렌더링 유틸
    private renderPenaltyButton(id_a: string | null): string {
        if (id_a && this.penaltyIds.has(id_a)) {
            return `<button type="button" class="btn btn-outline-danger btn-sm ms-2 law-penalty-btn" data-id_a="${id_a}">
                <i class="fas fa-gavel"></i> 벌칙
            </button>`;
        }
        return '';
    }    



    // Setters

    setTextSize(size: string): void {
        this.currentTextSize = size;
    }

    // Private 유틸함수

    // 개행문자를 <br>로 변환
    // |*|로 구분된 텍스트를 div로 감싸서 반환
    // private formatContent(text: string|null, searchText: string): string {
    //     if (!text) return '';
        
    //     // 검색어가 있을 경우 하이라이트 처리 : 250404
    //     if (searchText) {
    //         text = text.replace(new RegExp(searchText, 'gi'), 
    //              match => `<span class="text-danger fw-bold">${match}</span>`);
    //     }

    //     return '<div class="box-container p-0 m-0">' +
    //         text.split("|*|").map(item => 
    //             `<div class="box-item small p-2 m-0">${item.replace(/\n/g, '<br>')}</div>`
    //         ).join("") +
    //         '</div>';
    // }

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