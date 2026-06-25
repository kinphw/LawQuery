import { ReferencePopupManager } from './ReferencePopupManager';
import ApiUrlBuilder from '../../../util/ApiUrlBuilder';
import { getLawConfig } from '../../../config/LawConfig';

export class ReferenceButtonHandler {
    private popupManager: ReferencePopupManager;

    constructor() {
        this.popupManager = new ReferencePopupManager();
    }

    bindReferenceButtons(): void {
        const law = new URLSearchParams(window.location.search).get('law') || 'j';
        const originMap = getLawConfig(law).originMap;

        document.querySelectorAll('.law-ref-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = (btn as HTMLElement).getAttribute('data-id');
                if (!id) return;

                this.popupManager.closePopup();

                const url = ApiUrlBuilder.buildWithParams('/api/law/reference', { id });
                const res = await fetch(url);
                const { data }: { data: { items: { type: string, content: string, url?: string | null }[] } } = await res.json();

                const content = data.items && data.items.length > 0
                    ? `<ul class="list-group">${data.items.map(item => {
                        const label = item.type === 'text'
                            ? ''
                            : `[${originMap[item.type.replace('db_', '')] ?? item.type}]\n`;
                        const text = (label + item.content).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
                        // 외부법(text)은 본문 임베드 + law.go.kr 원문 링크(별도 줄)
                        const link = item.url
                            ? `<br><a href="${encodeURI(item.url)}" target="_blank" rel="noopener" class="text-primary small">📄 법령정보센터 원문 🔗</a>`
                            : '';
                        return `<li class="list-group-item bg-light text-dark mb-2">${text}${link}</li>`;
                    }).join('')}</ul>`
                    : '<span class="text-muted">참조규정 없음</span>';

                const mouseEvent = e as MouseEvent;
                this.popupManager.showPopup(content, mouseEvent.clientX + 10, mouseEvent.clientY + 10);
            });
        });
    }
}