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

    strVer:string = ""; // 버전
    strDateUpdate:string = ''; // 업데이트 날짜 // 이곳을 수정하면 자동으로 업데이트됨
    changelogLogs: { ver: string, date: string, desc: string }[] = []; // 250502 추가

    // 비동기 초기화
    async init(): Promise<void> {
        const res = await fetch('assets/changelog.json');
        const changelog = await res.json();
        this.strVer = changelog.version;
        this.strDateUpdate = changelog.date;
        this.changelogLogs = changelog.logs;
    }

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

        // const btn = document.getElementById('infoButton');
        // console.log('infoButton:', btn); // null이면 렌더링 타이밍 문제

        document.getElementById('infoButton')?.addEventListener('click', 
            () => this.showInfo());

        document.getElementById('changelogButton')?.addEventListener('click',
            () => this.showUpdate());  
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
                <span class="badge bg-primary">v${this.strVer}</span>
                <span class="badge bg-secondary">${this.strDateUpdate}</span>
            </div>
            <div class="text-muted small">Apache license 2.0</div>
        `);
    }    
    

    // private showUpdate(): void {
    //     // alert(`
    // ModalManager.showModal('업데이트 내역', `
    // v0.1.31 DD250427 (법률) 2조 및 25조 항호별 분리 <br>
    // v0.1.3 DD250424 (유권해석) 조회효율 개선 <br>
    // v0.1.2 DD250404 <br>
    // (법률조회) 검색기능 추가 및 검색시 하이라이트기능 <br>
    // (유권해석조회) 검색기능 보완(본문 눌러도 접히게) <br>
    // v0.1.1 DD250402 (유권해석조회) 현장건의 추가, 검색기능 개선(%%) <br>
    // `);
    // }

    private showUpdate(): void {
        const rows = this.changelogLogs.map(log =>
            this.makeChangelogRow(log.ver, log.date, log.desc)
        ).join('');
    
        ModalManager.showModal('업데이트 내역', `
            <table class="table table-sm align-middle mb-0">
                <thead class="table-light">
                    <tr>
                        <th>버전</th>
                        <th>일자</th>
                        <th>수정사항</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        `);
    }


    private makeChangelogRow(ver: string, date: string, desc: string): string {
        return `<tr>
            <td>${ver}</td>
            <td>${date}</td>
            <td>${desc}</td>
        </tr>`;
    }

}
