import { ReferencePopupManager } from './ReferencePopupManager';

export class ReferenceButtonHandler {
    private popupManager: ReferencePopupManager;

    constructor() {
        this.popupManager = new ReferencePopupManager();
    }

    bindReferenceButtons(): void {
        document.querySelectorAll('.law-ref-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = (btn as HTMLElement).getAttribute('data-id');

                // console.log('참조 버튼 클릭', id); // ← 로그로 진입 확인 

                if (!id) return;
                // 이미 열려있으면 닫기
                this.popupManager.closePopup();

                // fetch 참조규정
                const res = await fetch(`/api/law/reference?id=${encodeURIComponent(id)}`);
                const { data } = await res.json();

                // console.log('참조 fetch 결과', data); // ← fetch 결과 확인

                const content = data ? data.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') : '<span class="text-muted">참조규정 없음</span>';

                // 마우스 위치 기준으로 팝업 띄우기
                const mouseEvent = e as MouseEvent;
                this.popupManager.showPopup(content, mouseEvent.clientX + 10, mouseEvent.clientY + 10);
            });
        });
    }
}