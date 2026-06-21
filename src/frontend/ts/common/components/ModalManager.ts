export class ModalManager {
    static showModal(title: string, content: string) {
        const modal = document.getElementById('commonModal');
        if (!modal) return;
        modal.querySelector('.modal-title')!.textContent = title;
        modal.querySelector('.modal-body')!.innerHTML = content;
        // 요소당 인스턴스 1개만 유지(getOrCreateInstance). new로 매번 만들면
        // show()가 중복 호출될 때 백드롭이 겹겹이 쌓여, X로 닫아도 백드롭이 남아
        // 화면이 잠긴 듯 보이는 버그가 난다. 같은 인스턴스면 두번째 show()는 무시됨.
        const bsModal = (window as any).bootstrap.Modal.getOrCreateInstance(modal);
        bsModal.show();
    }
}