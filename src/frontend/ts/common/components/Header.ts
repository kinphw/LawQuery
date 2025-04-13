/**
 * Header.ts
 * ------------------------
 * 페이지 공통사용할 헤더 컴포넌트 (렌더링대상)
 * 
 * 작성자: kinphw
 * 작성일: 2025-03-02
 * 버전: 0.0.1
 */
export class Header {

    strVer:string = "0.1.2"; // 버전
    strDateUpdate:string = '250404'; // 업데이트 날짜 // 이곳을 수정하면 자동으로 업데이트됨

    render(currentPage: 'law' | 'interpretation'): string {        

        const html = `
        <header class="text-center p-3 border bg-light">
            <div class="d-flex justify-content-between align-items-center mb-2">
                <img src="assets/img/penguin.PNG" alt="Penguin" style="height: 40px;">
                <h2 class="mb-0 position-absolute start-50 translate-middle-x">Law Query</h2>
                <div class="d-flex gap-2">

                    <button class="btn btn-link text-danger p-1" id="changelogButton">
                        <small class="fw-bold">NEW ${this.strDateUpdate}</small>
                    </button>

                    <button class="btn btn-link" id="infoButton">
                        <i class="fas fa-question-circle fs-4"></i>
                    </button>

                </div>
            </div>    
            <div>
                <button class="btn ${currentPage === 'law' ? 'btn-primary' : 'btn-secondary'} me-2" 
                    onclick="location.href='law.html'">법률조회</button>
                <button class="btn ${currentPage === 'interpretation' ? 'btn-primary' : 'btn-secondary'}" 
                    onclick="location.href='index.html'">유권해석조회</button>
            </div>
        </header>`;

        // 렌더링 후 이벤트 바인딩
        // document.getElementById('infoButton')?.addEventListener('click', 
        //     () => this.showInfo());

        return html;
    }

    setInfoButtonHandler(): void { // 업데이트문도 재사용
        document.getElementById('infoButton')?.addEventListener('click', 
            () => this.showInfo());

        document.getElementById('changelogButton')?.addEventListener('click',
            () => this.showUpdate());  
    }    

    private showInfo(): void {
        alert(`
    LawQuery_금융법령, 유권해석, 비조치의견서 검색 및 조회를 위한 웹 어플리케이션입니다.        
    kinphw (github.com/kinphw/LawQuery)
    v${this.strVer} (${this.strDateUpdate})
    Apache license 2.0
    `);
    }
    

    private showUpdate(): void {
        alert(`
    v0.1.2 DD250404
    (법률조회) 검색기능 추가 및 검색시 하이라이트기능
    (유권해석조회) 검색기능 보완(본문 눌러도 접히게)
    v0.1.1 DD250402
    (유권해석조회) 현장건의 추가, 검색기능 개선(%%)
    `);
    }

}
