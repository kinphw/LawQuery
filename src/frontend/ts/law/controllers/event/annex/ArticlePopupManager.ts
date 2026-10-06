import { makeDraggable, placeInViewport } from "../../../util/DraggablePopup";

export class ArticlePopupManager {
    private popupEl: HTMLElement | null = null;

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

        // Position (ensure it doesn't go off-screen)
        placeInViewport(this.popupEl, x, y);

        // Close button
        this.popupEl.querySelector('.btn-close')?.addEventListener('click', () => this.closePopup());

        // Drag (mouse + touch)
        makeDraggable(this.popupEl, this.popupEl.querySelector('.law-ref-popup-header') as HTMLElement);
    }

    closePopup() {
        if (this.popupEl) {
            this.popupEl.remove();
            this.popupEl = null;
        }
    }
}
