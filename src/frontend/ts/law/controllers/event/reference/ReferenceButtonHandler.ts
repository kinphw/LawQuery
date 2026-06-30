import { ReferencePopupManager } from './ReferencePopupManager';
import ApiUrlBuilder from '../../../util/ApiUrlBuilder';
import { getLawConfig } from '../../../config/LawConfig';

export class ReferenceButtonHandler {
    private popupManager: ReferencePopupManager;

    constructor() {
        this.popupManager = new ReferencePopupManager();
    }

    private delegated = false;
    bindReferenceButtons(): void {
        // #results 위임(한 번만). 지연 렌더(가상화)된 버튼도 동작, 재렌더에도 생존.
        if (this.delegated) return;
        const host = document.getElementById('results');
        if (!host) return;
        this.delegated = true;
        host.addEventListener('click', async (e) => {
                const btn = (e.target as HTMLElement).closest('.law-ref-btn');
                if (!btn) return;
                e.stopPropagation();
                const id = btn.getAttribute('data-id');
                if (!id) return;

                const law = new URLSearchParams(window.location.search).get('law') || 'j';
                const originMap = getLawConfig(law).originMap;
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
    }
}