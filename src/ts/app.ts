// App : 라우터/팩토리 역할
// (html 구조이므로 N:1로)
// v0.0.1
// 2025-03-02

class App {
    async init() {

        // 이하는 모두 팩토리메서드와 컨트롤러에게 기능 이관
        // 데이터셋 호출
        // const dataset = new window.Dataset().getDatabaseBinary();                
        // // 데이터셋을 주입하며 데이터베이스 객체생성 및 초기화
        // const db = new Database(dataset);
        // await db.init();
        
        // db를 주입하며 모델 객체 생성
        // const model = new SearchModel(db); // 컨트롤러에 이관
        // 뷰 객체 생성
        // const view = new MainView(); // 컨트롤러에 이관

        // 모델과 뷰를 주입하며 컨트롤러 객체 생성
        // const controller = new SearchController(model, view); // 팩토리메서드로 변경
        
        const currentPage = this.getCurrentPage();
        const controller = this.createController(currentPage);
        await controller.initialize();
    }

    // 라우팅 판단
    private getCurrentPage(): string {
        return window.location.pathname.includes('law.html') ? 'law' : 'interpretation';
    }

    // 팩토리메서드
    private createController(page: string): any {
        switch(page) {
            case 'law':
                // return new window.LawController(); // 추후 구현
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