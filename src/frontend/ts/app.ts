/**
 * 웹 애플리케이션의 진입점이자 라우터/팩토리 역할을 하는 클래스
 * 
 * @description
 * App 클래스는 다음과 같은 주요 책임을 가집니다:
 * 1. 라우팅 - URL 기반으로 현재 페이지 판단
 * 2. 컨트롤러 생성 - 페이지에 맞는 컨트롤러 인스턴스화
 * 3. 초기화 조정 - 생성된 컨트롤러의 초기화 프로세스 관리
 * 
 * 현재 지원하는 페이지:
 * - law.html: 법률 관련 페이지 ({@link LawController})
 * - 기타: 해석 검색 페이지 ({@link SearchController})
 * 
 * @version 0.0.1
 * @since 2025-03-02
 *
 */
// App : 라우터/팩토리 역할
// (html 구조이므로 N:1로)
// v0.0.1
// 2025-03-02


class App {
    async init() {
                
        // 라우팅 판단 및 팩토리메서드 호출
        const currentPage = this.getCurrentPage();
        const controller = this.createController(currentPage);
        
        // 컨트롤러 초기화
        await controller.initialize(); // 모든 컨트롤러는 ICommand 인터페이스를 구현하므로, initialize() 메서드를 가짐
    }

    // 라우팅 판단
    private getCurrentPage(): string {
        return window.location.pathname.includes('law.html') ? 'law' : 'interpretation';
    }

    // 팩토리메서드
    private createController(page: string): any {
        switch(page) {
            case 'law':
                return new window.LawController();
            case 'interpretation':
            default:
                return new window.SearchController();
        }
    }    
}

// 실질 진입부
document.addEventListener('DOMContentLoaded', async () => {
    const app = new App();
    await app.init();
});
window.App = App;