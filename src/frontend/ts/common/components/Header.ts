/**
 * Header.ts
 * ------------------------
 * 페이지 공통사용할 헤더 컴포넌트 (렌더링대상)
 * 
 * 작성자: kinphw
 * 작성일: 2025-05-02
 * 버전: 0.0.2
 */
import { ModalManager } from './ModalManager';

export class Header {

    render(currentPage: 'law' | 'interpretation'): string {

        const html = `
        <header class="text-center p-3 border bg-light">
            <div class="d-flex justify-content-between align-items-center mb-2">
                <img src="assets/img/penguin.PNG" alt="Penguin" style="height: 40px;">
                <h2 class="mb-0 position-absolute start-50 translate-middle-x">Law Query</h2>
                <div class="d-flex gap-2">

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

    setInfoButtonHandler(): void {
        document.getElementById('infoButton')?.addEventListener('click',
            () => this.showInfo());
    }    

    // private showInfo(): void {
    //     alert(`
    // LawQuery_금융법령, 유권해석, 비조치의견서 검색 및 조회
    // kinphw (github.com/kinphw/LawQuery)
    // v${this.strVer} (${this.strDateUpdate})
    // Apache license 2.0
    // `);
    // }

    private showInfo(): void {
        ModalManager.showModal('LawQuery 정보', `
            <div class="mb-2">
                <strong>LawQuery</strong> <span class="text-secondary">전금법령, 유권해석, 비조치의견서 검색 및 조회</span>
            </div>
            <div class="mb-1">
                <a href="https://github.com/kinphw/LawQuery" target="_blank" rel="noopener">
                    <i class="fab fa-github"></i> github.com/kinphw/LawQuery
                </a>
            </div>
            <div class="mb-1">
                <a href="https://github.com/kinphw/LawQuery/releases" target="_blank" rel="noopener">
                    <i class="fas fa-history"></i> 업데이트 내역 (Releases)
                </a>
            </div>
            <div class="text-muted small">Apache license 2.0</div>
        `);
    }    
    


}
