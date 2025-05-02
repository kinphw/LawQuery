export class ModalManager {
    static showModal(title: string, content: string) {
        const modal = document.getElementById('commonModal');
        if (!modal) return;
        modal.querySelector('.modal-title')!.textContent = title;
        modal.querySelector('.modal-body')!.innerHTML = content;
        // Bootstrap 5 모달 인스턴스 생성 및 표시
        const bsModal = new (window as any).bootstrap.Modal(modal);
        bsModal.show();
    }
}