import { ReferencePopupManager } from './ReferencePopupManager';
import ApiUrlBuilder from '../../../util/ApiUrlBuilder';

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

                // ApiUrlBuilder를 사용하여 URL 생성
                const additionalParams = { id };
                const url = ApiUrlBuilder.buildWithParams('/api/law/reference', additionalParams);

                // fetch 참조규정
                const res = await fetch(url);
                const { data }: { data: { texts: string[], annexes: string[] } } = await res.json();

                // console.log('참조 fetch 결과', data); // ← fetch 결과 확인

                // const content = data ? data.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') : '<span class="text-muted">참조규정 없음</span>';

                // 여러 레코드를 처리
                // const content = data.length > 0
                //     ? data.map(item => `<div>${item.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`).join('')
                //     : '<span class="text-muted">참조규정 없음</span>';

                // 250624 수정: data.texts 사용
                const content = data.texts && data.texts.length > 0
                    ? `<ul class="list-group">${data.texts.map(item => `<li class="list-group-item bg-light text-dark mb-2">${item.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</li>`).join('')}</ul>`
                    : '<span class="text-muted">참조규정 없음</span>';


                // 마우스 위치 기준으로 팝업 띄우기
                const mouseEvent = e as MouseEvent;
                this.popupManager.showPopup(content, mouseEvent.clientX + 10, mouseEvent.clientY + 10);
            });
        });
    }
}