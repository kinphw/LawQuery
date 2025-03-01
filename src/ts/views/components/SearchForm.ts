class SearchForm {
    bindEvents(searchHandler: () => void): void {
        // 폼 submit 이벤트 처리
        const form = document.getElementById('searchForm');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                searchHandler();
            });
        }

        // 검색 버튼 클릭 이벤트
        const searchBtn = document.getElementById('searchBtn');
        if (searchBtn) {
            searchBtn.addEventListener('click', searchHandler);
        }

        // 엔터키 이벤트
        ['serialInput', 'keywordInput'].forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                input.addEventListener('keydown', (e: KeyboardEvent) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        searchHandler();
                    }
                });
            } else {
                console.error(`요소를 찾을 수 없음: ${id}`);
            }
        });
    }
}
window.SearchForm = SearchForm;