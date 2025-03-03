// LawController.ts:
// 법령조회의 컨트롤러
// v0.0.1
// 2025-03-03
class LawController implements IController {

    private currentResults: LawResult[] = []; // Store current results

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
        // Store initial results
        this.currentResults = results;

        this.view.render(results);

        // 이벤트 바인딩을 컨트롤러에서 일괄 처리
        this.bindEvents();
    }

    private bindEvents(): void {
        this.bindHeaderEvents();
        this.bindTextSizeEvents();
    }

    private bindHeaderEvents(): void {
        this.view.header.setInfoButtonHandler();
    }

    private bindTextSizeEvents(): void {
        document.querySelectorAll('input[name="textSize"]').forEach(radio => {
            radio.addEventListener('change', (e: Event) => this.handleTextSizeChange(e));
        });
    }  
    
    private handleTextSizeChange(e: Event): void {
        const target = e.target as HTMLInputElement;
        this.view.lawTable.setTextSize(target.value);
        this.view.render(this.currentResults);
        // Rebind all events after re-render
        this.bindHeaderEvents();
    }
}

window.LawController = LawController;