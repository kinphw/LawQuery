export class ReferencePopupManager {
    private popupEl: HTMLElement | null = null;
    private offsetX = 0;
    private offsetY = 0;
    private isDragging = false;

    showPopup(content: string, x: number, y: number) {
        this.closePopup();
        this.popupEl = document.createElement('div');
        this.popupEl.className = 'law-ref-modal-popup';
        this.popupEl.innerHTML = `
            <div class="law-ref-popup-header" style="cursor:move;user-select:none;">
                <span>참조규정</span>
                <button type="button" class="btn-close btn-sm float-end" style="font-size:1.1em;"></button>
            </div>
            <div class="law-ref-popup-body">${content}</div>
        `;
        document.body.appendChild(this.popupEl);

        // 위치 지정
        this.popupEl.style.left = `${x}px`;
        this.popupEl.style.top = `${y}px`;

        // 닫기 버튼
        this.popupEl.querySelector('.btn-close')?.addEventListener('click', () => this.closePopup());

        // 드래그 이벤트
        const header = this.popupEl.querySelector('.law-ref-popup-header') as HTMLElement;
        header.addEventListener('mousedown', (e) => this.startDrag(e));
        document.addEventListener('mousemove', this.onDrag);
        document.addEventListener('mouseup', this.endDrag);
    }

    private startDrag = (e: MouseEvent) => {
        if (!this.popupEl) return;
        this.isDragging = true;
        this.offsetX = e.clientX - this.popupEl.offsetLeft;
        this.offsetY = e.clientY - this.popupEl.offsetTop;
        document.body.style.userSelect = 'none';
    };

    private onDrag = (e: MouseEvent) => {
        if (!this.isDragging || !this.popupEl) return;
        this.popupEl.style.left = `${e.clientX - this.offsetX}px`;
        this.popupEl.style.top = `${e.clientY - this.offsetY}px`;
    };

    private endDrag = () => {
        this.isDragging = false;
        document.body.style.userSelect = '';
    };

    closePopup() {
        if (this.popupEl) {
            this.popupEl.remove();
            this.popupEl = null;
        }
        document.removeEventListener('mousemove', this.onDrag);
        document.removeEventListener('mouseup', this.endDrag);
    }
}