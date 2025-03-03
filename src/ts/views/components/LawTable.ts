class LawTable {

  // 법령명 thead 설정을 위한 클래스변수수  
    public names : string[] = [
        '전자금융거래법\n[시행 2024. 9. 15.]\n[법률 제19734호, 2023. 9. 14., 일부개정]',
        '전자금융거래법 시행령\n[시행 2024. 12. 27.]\n[대통령령 제35038호, 2024. 12. 3., 타법개정]',
        '전자금융감독규정\n[시행 2025. 2. 5.]\n[금융위원회고시 제2025-4호, 2025. 2. 5., 일부개정]',
        '전자금융감독규정시행세칙\n[시행 2025. 2. 5.]\n[금융감독원세칙 , 2025. 2. 3., 일부개정]'
    ]

    private currentTextSize: string = ''; // Add text size state

    private lawIds: string[] = []; // 조문 ID 목록 저장

    // 체크박스 렌더링을 위한 메서드 추가
    renderLawCheckboxes(laws: Array<{id_a: string, title_a: string}>): string {
        this.lawIds = laws.map(law => law.id_a);
        
        return laws.map(law => `
            <div class="form-check">
                <input class="form-check-input" type="checkbox" value="${law.id_a}" id="law${law.id_a}">
                <label class="form-check-label" for="law${law.id_a}">
                    ${law.title_a}
                </label>
            </div>
        `).join('');
    }


    setTextSize(size: string): void {
        this.currentTextSize = size;
    }

    render(results: LawResult[]): string {
        if (!results.length) {
            return '<div class="alert alert-warning">표시할 법령이 없습니다.</div>';
        }

        let html = '<div><table class="table table-bordered law-table">';
        
        // 헤더 - names 배열 활용
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
            </thead>`;

            // ${this.names.map(name => 
            //     `<th class="text-center small fw-bold py-1">${name.replace(/\n/g, '<br>')}</th>`
            // ).join('')}


        // Data with dynamic text size
        html += '<tbody>';
        results.forEach(row => {
            html += '<tr>';
            ['law_content', 'decree_content', 'regulation_content', 'rule_content'].forEach(col => {
                html += `<td class="${this.currentTextSize} p-2 m-0">${this.formatContent(row[col])}</td>`;
            });
            html += '</tr>';
        });
        html += '</tbody></table></div>';

        return html;
    }

    // 개행문자를 <br>로 변환
    // |*|로 구분된 텍스트를 div로 감싸서 반환
    private formatContent(text: string): string {
        if (!text) return '';
        return '<div class="box-container p-0 m-0">' +
            text.split("|*|").map(item => 
                `<div class="box-item small p-2 m-0">${item.replace(/\n/g, '<br>')}</div>`
            ).join("") +
            '</div>';
    }
}

window.LawTable = LawTable;