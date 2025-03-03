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

        // 체크박스 렌더링
        const lawTitles = this.model.getLawTitles();
        document.getElementById('lawCheckboxes')!.innerHTML = 
            this.view.lawTable.renderLawCheckboxes(lawTitles);

        // 이벤트 바인딩을 컨트롤러에서 일괄 처리
        this.bindEvents();
    }

    // 이하는 이벤트바인딩 함수

    // 이벤트바인딩 래퍼 (초기화할때만 사용)
    private bindEvents(): void {
        this.bindHeaderEvents();
        this.bindTextSizeEvents();
        this.bindSearchEvents();        
    }

    // 개별 이벤트바인딩 함수
    private bindHeaderEvents(): void {
        this.view.header.setInfoButtonHandler();
    }

    private bindTextSizeEvents(): void {
        document.querySelectorAll('input[name="textSize"]').forEach(radio => {
            radio.addEventListener('change', (e: Event) => this.handleTextSizeChange(e));
        });
    }  
    private bindSearchEvents(): void {
        const searchBtn = document.getElementById('lawSearchBtn');
        if (searchBtn) {
            searchBtn.addEventListener('click', () => this.handleSearch());
        }
    } 


    // 이하는 이벤트핸들러
    
    private handleSearch(): void {
        const selectedLaws = Array.from(document.querySelectorAll('input[type="checkbox"]:checked'))
            .map(cb => (cb as HTMLInputElement).value);

        if (selectedLaws.length) {
            const results = this.model.getLawsByIds(selectedLaws);
            this.currentResults = results;
            this.view.render(results);
            // this.bindEvents();
            // this.bindHeaderEvents();
        }
    }    


    private handleTextSizeChange(e: Event): void {
        const target = e.target as HTMLInputElement;
        this.view.lawTable.setTextSize(target.value);
        this.view.render(this.currentResults);
        // Rebind all events after re-render
        // this.bindHeaderEvents();
    }
}

window.LawController = LawController;