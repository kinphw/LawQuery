class LawView {
    public header: Header;
    public lawTable: LawTable;
    private toastManager: ToastManager;    

    constructor() {
        this.header = new window.Header();
        this.lawTable = new LawTable();
        this.toastManager = new ToastManager();        
    }

    render(results: LawResult[], searchText: string = ''): void {
        document.getElementById('header')!.innerHTML = this.header.render('law');
        document.getElementById('results')!.innerHTML = 
            this.lawTable.render(results, searchText);
    }

    showToast(message: string): void {
        this.toastManager.showToast(message);
    }

}

window.LawView = LawView;