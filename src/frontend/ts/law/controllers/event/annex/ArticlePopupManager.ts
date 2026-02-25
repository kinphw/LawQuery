export class ArticlePopupManager {
    private popupEl: HTMLElement | null = null;
    private offsetX = 0;
    private offsetY = 0;
    private isDragging = false;

    showPopup(title: string, content: string, x: number, y: number) {
        this.closePopup();
        this.popupEl = document.createElement('div');
        this.popupEl.className = 'law-ref-modal-popup'; // Reusing reference styling
        this.popupEl.innerHTML = `
            <div class="law-ref-popup-header" style="cursor:move;user-select:none; background-color: #0dcaf0;">
                <span class="text-dark fw-bold">${title}</span>
                <button type="button" class="btn-close btn-sm float-end" style="font-size:1.1em;"></button>
            </div>
            <div class="law-ref-popup-body p-2" style="max-height: 400px; overflow-y: auto;">
                ${content}
            </div>
        `;
        document.body.appendChild(this.popupEl);

        // Calculate position (ensure it doesn't go off-screen)
        const rect = this.popupEl.getBoundingClientRect();
        const maxLeft = window.innerWidth - rect.width - 20;
        const maxTop = window.innerHeight - rect.height - 20;

        let finalX = x;
        let finalY = y;

        if (finalX > maxLeft) finalX = maxLeft;
        if (finalY > maxTop) finalY = maxTop;
        if (finalX < 10) finalX = 10;
        if (finalY < 10) finalY = 10;

        this.popupEl.style.left = `${finalX}px`;
        this.popupEl.style.top = `${finalY}px`;

        // Close button
        this.popupEl.querySelector('.btn-close')?.addEventListener('click', () => this.closePopup());

        // Drag events
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
