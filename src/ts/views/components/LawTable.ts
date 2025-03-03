class LawTable {
    render(results: LawResult[]): string {
        if (!results.length) {
            return '<div class="alert alert-warning">표시할 법령이 없습니다.</div>';
        }

        let html = `
            <table class="table table-bordered table-hover">
                <thead class="table-light">
                    <tr>
                        <th width="10%">법령구분</th>
                        <th width="10%">조문번호</th>
                        <th width="20%">조문제목</th>
                        <th width="60%">조문내용</th>
                    </tr>
                </thead>
                <tbody>`;

        results.forEach(law => {
            html += `
                <tr data-law-id="${law.법령ID}">
                    <td class="text-center">${law.법령명 || ''}</td>
                    <td class="text-center">${law.조문번호 || ''}</td>
                    <td>${law.조문제목 || ''}</td>
                    <td>${this.formatContent(law.조문내용)}</td>
                </tr>`;
        });

        html += '</tbody></table>';
        return html;
    }

    private formatContent(text: string): string {
        return text ? text.replace(/\n/g, '<br>') : '';
    }

    setRowClickHandler(): void {
        document.querySelectorAll('tr[data-law-id]').forEach(row => {
            row.addEventListener('click', () => {
                const lawId = row.getAttribute('data-law-id');
                if (lawId) this.onLawSelect(lawId);
            });
        });
    }

    private onLawSelect(lawId: string): void {
        // 현재 선택된 행에 대한 스타일 처리
        document.querySelectorAll('tr[data-law-id]').forEach(row => {
            row.classList.remove('table-primary');
        });
        const selectedRow = document.querySelector(`tr[data-law-id="${lawId}"]`);
        selectedRow?.classList.add('table-primary');

        // 이벤트 발생 - LawController에서 처리
        const event = new CustomEvent('lawSelected', { detail: lawId });
        document.dispatchEvent(event);
    }
}

window.LawTable = LawTable;