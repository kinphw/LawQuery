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
    }

    showToast(message: string): void {
        // Toast container 생성 또는 가져오기
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        // Toast message 요소 생성
        const toast = document.createElement('div');
        toast.className = 'toast-message';
        toast.textContent = message;
        container.appendChild(toast);

        // Trigger reflow & add show class
        toast.offsetHeight;
        toast.classList.add('show');

        // 3초 후 제거
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                container.removeChild(toast);
                if (container.children.length === 0) {
                    document.body.removeChild(container);
                }
            }, 300);
        }, 1000);
    }

}

window.LawView = LawView;