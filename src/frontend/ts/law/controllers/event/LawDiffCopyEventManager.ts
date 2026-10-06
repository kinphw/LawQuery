import { ILawEventManager } from './ILawEventManager';
import { ToastManager } from '../../../common/components/ToastManager';
import { ILawController } from '../LawController';
import { findNode } from './LawCmpEventManager';

/** 복사할 때 빼는 것 — 사라진 문언(취소선)과 박스 안 버튼·칩·시행예정 표시줄. */
const STRIP = 'del.law-del, .lq-copy-new, .lq-cmp-tag, .lq-sched-foot';

/**
 * LawDiffCopyEventManager — 겹쳐 쓴 박스(시행예정·날짜 대비)의 '변경 후' 문언만 복사.
 *  - '변경 후 복사' 버튼: 칸의 data-id 로 조회 결과에서 변경 후 원문(시행예정 본문·cmp.newer)을 그대로 꺼낸다.
 *    화면에서 긁지 않으므로 검색 강조·흐림 처리와 무관하게 원문 그대로다.
 *  - 일반 복사(Ctrl+C·우클릭 복사): 선택 범위에 취소선이 끼어 있으면 그것만 빼고 복사한다.
 *    취소선 없는 선택은 브라우저 기본 복사 그대로.
 */
export class LawDiffCopyEventManager implements ILawEventManager {

    private bound = false;
    private toast = new ToastManager();

    constructor(private controller: ILawController) { }

    bindEvents(): void {
        if (this.bound) return;
        this.bound = true;

        document.addEventListener('click', (e) => {
            const btn = (e.target as HTMLElement).closest<HTMLElement>('.lq-copy-new');
            const box = btn?.closest<HTMLElement>('.box-item');
            if (!box) return;
            e.preventDefault();
            e.stopPropagation();
            const text = this.newerText(box) ?? this.stripped(box);
            this.write(text).then(ok => this.toast.showToast(ok ? '변경 후 문언을 복사했습니다' : '복사에 실패했습니다'));
        });

        document.addEventListener('copy', (e) => {
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed || !e.clipboardData) return;
            const holder = document.createElement('div');
            let hit = false;
            for (let i = 0; i < sel.rangeCount; i++) {
                const range = sel.getRangeAt(i);
                const frag = range.cloneContents();
                if (frag.querySelector('del.law-del')) hit = true;
                // 선택이 취소선 안에서 시작·끝나면 조각에 <del> 태그가 없다 → 조상으로 판정
                const anc = range.commonAncestorContainer;
                const ancEl = anc.nodeType === Node.ELEMENT_NODE ? anc as Element : anc.parentElement;
                if (ancEl?.closest('del.law-del')) return;   // 취소선 안만 고른 경우 — 고른 대로 복사
                holder.appendChild(frag);
            }
            if (!hit) return;
            holder.querySelectorAll(STRIP).forEach(el => el.remove());
            e.clipboardData.setData('text/plain', this.plain(holder));
            e.clipboardData.setData('text/html', holder.innerHTML);
            e.preventDefault();
        });
    }

    /** 원 데이터에서 변경 후 문언 — 칸을 못 찾으면 null(화면에서 긁는 쪽으로 폴백). */
    private newerText(box: HTMLElement): string | null {
        const id = box.closest<HTMLElement>('td[data-id]')?.dataset.id;
        const node = id ? findNode(this.controller.dataManager.getCurrentResults(), id) : null;
        if (!node) return null;
        const text = box.classList.contains('box-item--cmp') ? node.cmp?.newer : node.scheduledTitle;
        return text ? text.trim() : null;
    }

    private stripped(box: HTMLElement): string {
        const clone = box.cloneNode(true) as HTMLElement;
        clone.querySelectorAll(STRIP).forEach(el => el.remove());
        return this.plain(clone);
    }

    /** 칸 안 문언은 <br> 로 줄을 나누고 박스는 div 로 나뉜다 → 그 둘만 줄바꿈으로 살린다. */
    private plain(el: HTMLElement): string {
        el.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
        el.querySelectorAll('div, tr, p').forEach(b => b.append('\n'));
        return (el.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
    }

    /** 로컬(file://) 판처럼 Clipboard API 가 없는 곳은 execCommand 로 폴백. */
    private async write(text: string): Promise<boolean> {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch { /* 폴백 */ }
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;left:-9999px;top:0';
        document.body.appendChild(ta);
        ta.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch { ok = false; }
        ta.remove();
        return ok;
    }
}
