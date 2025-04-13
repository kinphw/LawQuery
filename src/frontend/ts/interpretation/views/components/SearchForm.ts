export class SearchForm {
    // 메서드를 매개변수로 전달받아서 그 메서드를 이벤트바인딩
    setSearchHandler(handler: () => void): void {

        // 검색 버튼 클릭 이벤트
        const searchBtn = document.getElementById('searchBtn');
        if (searchBtn) {
            searchBtn.addEventListener('click', handler);
        }

        // 엔터키 이벤트
        ['serialInput', 'keywordInput'].forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                input.addEventListener('keydown', (e: KeyboardEvent) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        // 검색 버튼을 찾아서 클릭 이벤트 발생
                        const searchBtn = document.getElementById('searchBtn');
                        if (searchBtn) {
                            // 버튼에 active 클래스 추가
                            searchBtn.classList.add('active');
                            
                            // 100ms 후에 active 클래스 제거
                            setTimeout(() => {
                                searchBtn.classList.remove('active');
                                handler();
                            }, 100);
                        }
                    }
                });
            } else {
                console.error(`요소를 찾을 수 없음: ${id}`);
            }
        });
    }
}