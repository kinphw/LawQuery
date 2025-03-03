// LawController.ts:
// 법령조회의 컨트롤러
// v0.0.1
// 2025-03-03
class LawController implements IController {
    constructor(
        private model: LawModel,
        private view: LawView
    ) {}

    async initialize(): Promise<void> {
        // 데이터베이스 초기화
        const dataset = new window.Dataset().getDatabaseBinary();
        const db = new LawDatabase(dataset);
        await db.init();
        
        // 모델과 뷰 초기화
        this.model = new LawModel(db);
        this.view = new LawView();

        // 초기 데이터 로드 및 렌더링
        const results = this.model.getAllLaws();
        this.view.render(results);

        // 이벤트 바인딩을 컨트롤러에서 일괄 처리
        this.bindEvents();
    }

    private bindEvents(): void {        
        // 헤더 이벤트
        this.view.header.setInfoButtonHandler();       

      }     
}

window.LawController = LawController;