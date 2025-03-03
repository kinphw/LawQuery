class LawTable {
    render(results: LawResult[]): string {
        if (!results.length) {
            return '<div class="alert alert-warning">표시할 법령이 없습니다.</div>';
        }

        let html = '<div><table class="table table-bordered law-table">';
        
        // 헤더
        html += `
            <thead class="table-dark sticky-top">
                <tr>
                    <th class="text-center fw-bold py-1">법률</th>
                    <th class="text-center fw-bold py-1">시행령</th>
                    <th class="text-center fw-bold py-1">감독규정</th>
                    <th class="text-center fw-bold py-1">시행세칙</th>
                </tr>
            </thead>`;

        // 데이터
        html += '<tbody>';
        results.forEach(row => {
            html += '<tr>';
            ['law_content', 'decree_content', 'regulation_content', 'rule_content'].forEach(col => {
                html += `<td class="p-2 m-0">${this.formatContent(row[col])}</td>`;
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