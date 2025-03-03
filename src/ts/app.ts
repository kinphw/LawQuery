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