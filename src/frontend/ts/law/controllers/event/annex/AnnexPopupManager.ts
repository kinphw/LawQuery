import { makeDraggable, placeInViewport } from "../../../util/DraggablePopup";

export class AnnexPopupManager {
    private popupEl: HTMLElement | null = null;

    showPopup(content: string, x: number, y: number) {
        this.closePopup();
        this.popupEl = document.createElement('div');
        this.popupEl.className = 'law-ref-modal-popup'; // Use same styling as reference for consistency
        this.popupEl.innerHTML = `
            <div class="law-ref-popup-header" style="cursor:move;user-select:none; background-color: #198754;">
                <span>별표</span>
                <button type="button" class="btn-close btn-sm float-end" style="font-size:1.1em;"></button>
            </div>
            <div class="law-ref-popup-body p-2">${content}</div>
        `;
        document.body.appendChild(this.popupEl);

        // 위치 지정 (화면 밖으로 밀리지 않게)
        placeInViewport(this.popupEl, x, y);

        // 닫기 버튼
        this.popupEl.querySelector('.btn-close')?.addEventListener('click', () => this.closePopup());

        // 드래그 (마우스·터치 공통)
        makeDraggable(this.popupEl, this.popupEl.querySelector('.law-ref-popup-header') as HTMLElement);
    }

    closePopup() {
        if (this.popupEl) {
            this.popupEl.remove();
            this.popupEl = null;
        }
    }
}
