import { SearchResult } from '../../types/SearchResult.js'; // 검색결과 타입 정의
export class SearchResultTable {

    private currentTextSize: string = 'small';

    setTextSize(size: string): void {
        this.currentTextSize = size;
    }    


    render(results: SearchResult[]): string { // 모델의 검색결과를 받아서 렌더링한 HTML 문자열 반환
        if (!results.length) {
            return '<div class="alert alert-warning">검색 결과가 없습니다.</div>';
        }

        let html = `
            <table class="table table-bordered table-hover" style="table-layout: fixed; width: 100%;">
                <thead class="table-light">
                    <tr>
                        <th class="text-center align-middle text-nowrap w-10">구분</th>
                        <th class="text-center align-middle w-10">분야</th>
                        <th class="text-center align-middle text-nowrap w-50">제목</th>
                        <th class="text-center align-middle text-nowrap w-10">일련번호</th>
                        <th class="text-center align-middle text-nowrap w-10">회신일자</th>
                    </tr>
                </thead>
                <tbody>`;

        results.forEach((item, index) => { // 모델 검색결과(results) 순회하며 렌더링
            html += `
                <tr class="search-result-row ${this.currentTextSize}" data-row-index="${index}">
                    <td class="text-center align-middle text-nowrap w-10">${item.구분 || ''}</td>
                    <td class="text-center align-middle w-10" style="word-break: break-word">${item.분야 || ''}</td>
                    <td class="align-middle w-50">${item.제목 || ''}</td>
                    <td class="align-middle text-center w-10">${item.일련번호 || ''}</td>
                    <td class="align-middle text-center w-10">${(item.회신일자 || '').split(' ')[0]}</td>
                </tr>
                <tr class="detail-row d-none ${this.currentTextSize}" id="detail-${index}">
                    <td colspan="5" class="bg-light">
                        <div><strong>질의요지:</strong><br>${this.formatMultiline(item.질의요지)}</div>
                        <br>
                        <div class="mt-2"><strong>회답:</strong><br>${this.formatMultiline(item.회답)}</div>
                        <br>
                        <div class="mt-2"><strong>이유:</strong><br>${this.formatMultiline(item.이유)}</div>
                    </td>
                </tr>`;
        });

        html += `</tbody></table>`;
        return html;
    }

    private formatMultiline(text: string): string { // 개행문자(\n)를 <br>로 변환
        return text ? text.replace(/\n/g, '<br>') : '';
    }
    
    setRowClickHandler(): void {
        // document.querySelectorAll('.search-result-row, .detail-row').forEach(row => {
        document.querySelectorAll('.search-result-row').forEach(row => {
            row.addEventListener('click', () => {
                // const index = row.classList.contains('search-result-row') 
                //     ? row.getAttribute('data-row-index')
                //     : row.id.replace('detail-', '');
                
                const index = row.getAttribute('data-row-index');
                    
                const detailRow = document.getElementById(`detail-${index}`);
                
                // 토글 실행
                detailRow?.classList.toggle('d-none');
            });
        });
    }
}