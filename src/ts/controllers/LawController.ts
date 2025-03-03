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

        // 초기 데이터 로드 (전체 법률 목록)
        // const results = this.model.getAllLaws();
        const results = this.model.getRelatedLaws("1");
        this.view.render(results);

        // 이벤트 바인딩
        this.bindEvents();
    }

    private bindEvents(): void {
        // 법령 선택 이벤트
        // document.addEventListener('lawSelected', (e: CustomEvent) => {
        //     const lawId = e.detail;
        //     const relatedLaws = this.model.getRelatedLaws(lawId);
        //     this.view.render(relatedLaws);
        // });
    }
}

window.LawController = LawController;