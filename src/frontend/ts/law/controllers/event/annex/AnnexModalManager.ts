export class AnnexModalManager {
    constructor() { }

    showAnnexModal(tableHtml: string): void {
        const modalBody = document.querySelector('#annexModal .modal-body');
        if (modalBody) {
            modalBody.innerHTML = tableHtml;
        }

        const modalElement = document.getElementById('annexModal');
        if (modalElement) {
            // @ts-ignore - bootstrap is globally available
            const modal = new bootstrap.Modal(modalElement);
            modal.show();
        }
    }

    showAnnexViewerModal(url: string, title?: string): void {
        const modalElement = document.getElementById('annexViewerModal');
        if (!modalElement) return;

        const modalTitle = modalElement.querySelector('.modal-title');
        if (modalTitle && title) {
            modalTitle.textContent = title;
        }

        const modalBody = modalElement.querySelector('.modal-body');
        if (modalBody) {
            // Use 100vh or calc to ensure it takes up full space
            modalBody.innerHTML = `<iframe src="${url}" style="width: 100%; height: calc(100vh - 60px); border: none;"></iframe>`;
        }

        // @ts-ignore
        const modal = new bootstrap.Modal(modalElement);
        modal.show();

        // Clear iframe when hidden to stop background tasks / audio
        modalElement.addEventListener('hidden.bs.modal', () => {
            if (modalBody) {
                modalBody.innerHTML = '';
            }
        }, { once: true });
    }

    showOriginLawModal(title: string, content: string): void {
        const modalElement = document.getElementById('originLawModal');
        if (!modalElement) return;

        const modalTitle = modalElement.querySelector('.modal-title');
        if (modalTitle && title) {
            modalTitle.textContent = title;
        }

        const modalBody = modalElement.querySelector('.modal-body');
        if (modalBody) {
            modalBody.innerHTML = content;
        }

        // @ts-ignore
        const modal = new bootstrap.Modal(modalElement);
        modal.show();
    }
}
