class LawView {
    public header: Header;
    public lawTable: LawTable;

    constructor() {
        this.header = new window.Header();
        this.lawTable = new LawTable();
    }

    render(results: LawResult[]): void {
        document.getElementById('header')!.innerHTML = this.header.render('law');
        document.getElementById('results')!.innerHTML = this.lawTable.render(results);
        
        // 렌더링 후 이벤트 바인딩
        this.lawTable.setRowClickHandler();
    }
}

window.LawView = LawView;