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
import { appInfoHtml } from './appInfo';

export class Header {

    render(currentPage: 'law' | 'interpretation' | 'prec' | 'foreign' | 'press'): string {

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
            <!-- 화면 단추 다섯 개가 폰(375px)에서도 한 줄에 들어가게: 줄바꿈 없이, 글자·여백을 화면 폭에 맞춰 줄인다(넓으면 원래 크기) -->
            <div class="d-flex flex-nowrap justify-content-center" style="gap: clamp(.2rem, 1.2vw, .5rem);">
                ${([
                    ['law', 'index.html', '법률조회'],
                    ['interpretation', 'interpretation.html', '유권해석조회'],
                    ['prec', 'prec.html', '판례'],
                    ['foreign', 'foreign.html', '해외법령'],
                    ['press', 'press.html', '기관 보도자료'],
                ] as const).map(([page, href, label]) => `<button class="btn ${currentPage === page ? 'btn-primary' : 'btn-secondary'} text-nowrap"
                    style="font-size: clamp(.62rem, 2.8vw, 1rem); padding: .375rem clamp(.25rem, 1.4vw, .75rem);"
                    onclick="location.href='${href}'">${label}</button>`).join('')}
            </div>
        </header>`;

        // 렌더링 후 이벤트 바인딩
        // document.getElementById('infoButton')?.addEventListener('click', 
        //     () => this.showInfo());

        return html;
    }

    setInfoButtonHandler(): void {
        // onclick 할당(멱등). addEventListener는 여러 렌더 경로에서 반복 바인딩되어
        // 클릭 1회에 showInfo()가 중복 실행 → 모달 백드롭이 겹치는 원인이 된다.
        const btn = document.getElementById('infoButton');
        if (btn) (btn as HTMLElement).onclick = () => this.showInfo();
    }

    // private showInfo(): void {
    //     alert(`
    // LawQuery_금융법령, 유권해석, 비조치의견서 검색 및 조회
    // kinphw (github.com/kinphw/LawQuery)
    // v${this.strVer} (${this.strDateUpdate})
    // Apache license 2.0
    // `);
    // }

    // 모달 본문은 appInfo 모듈에 둔다 — 로컬(오프라인) 배포본에서는 그 모듈이 통째로
    // 교체되어 서비스 주소·저장소 링크가 실리지 않는다. 링크 추가는 반드시 그쪽에서.
    private showInfo(): void {
        ModalManager.showModal('LawQuery 정보', appInfoHtml());
    }
    


}
