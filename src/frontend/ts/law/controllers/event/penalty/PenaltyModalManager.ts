import { ILawController } from "../../LawController";

export class PenaltyModalManager {
    constructor(private controller: ILawController) {}

    showPenaltyModal(tableHtml: string): void {
        const modal = document.getElementById('penaltyModal');
        if (modal) {
            modal.querySelector('.modal-title')!.textContent = '벌칙 정보';
            modal.querySelector('.modal-body')!.innerHTML = tableHtml;
            // @ts-ignore — 요소당 인스턴스 1개만(백드롭 중복·잔류 방지)
            const bsModal = bootstrap.Modal.getOrCreateInstance(modal);
            bsModal.show();
        }
    }

    showOriginLawModal(content: string, baseJo: string = '',
                       chain: Array<{ origin: string; id: string; content: string }> = [],
                       focus: Record<string, number> = {}) {
        const modal = document.getElementById('originLawModal');
        const TIER: Record<string, string> = { a: '법', e: '시행령', s: '감독규정', r: '세칙' };
        const preStyle = "white-space:pre-wrap; font-family:'Noto Sans KR','Noto Sans','Malgun Gothic',"
            + "'Apple SD Gothic Neo',Arial,'Segoe UI',monospace; line-height:1.7; letter-spacing:0.01em;";
        const box = (c: string, jo: string) =>
            `<pre class="small mb-0" style="${preStyle}">${this.dimExceptFocus(c, focus[jo])}</pre>`;
        // 위임 하위(시행령 등) — '진짜 원인규정'까지 따라가 표시 + 관련 항/호만 강조
        const chainHtml = chain.map(c =>
            `<div class="mt-3 mb-1"><span class="badge bg-secondary">위임 ${TIER[c.origin] ?? c.origin}</span></div>`
            + box(c.content, c.id)).join('');
        if (modal) {
            modal.querySelector('.modal-title')!.textContent =
                chain.length ? '원문(법) + 위임 하위규정' : '원문(법) 전체 보기';
            modal.querySelector('.modal-body')!.innerHTML = box(content, baseJo) + chainHtml;
            // @ts-ignore — 요소당 인스턴스 1개만(백드롭 중복·잔류 방지)
            const bsModal = bootstrap.Modal.getOrCreateInstance(modal);
            bsModal.show();
        } else {
            alert(content);
        }
    }

    /** 조 본문에서 강조 단위(focusNum 번째 항/호)만 진하게, 나머지 항/호는 흐리게. focus 없으면 전체 표시. */
    private dimExceptFocus(content: string, focusNum: number | undefined): string {
        const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        if (!focusNum) return esc(content).replace(/\n/g, '<br>');
        const HANG = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮';
        const hasHang = new RegExp(`[${HANG}]`).test(content);
        const unitNum = (ln: string): number | null => {
            const t = ln.replace(/^\s+/, '');
            if (hasHang) { const i = HANG.indexOf(t[0]); return i >= 0 ? i + 1 : null; }
            const m = t.match(/^(\d+)\./); return m ? parseInt(m[1]) : null;
        };
        let out = '', started = false, inFocus = false;
        for (const ln of content.split('\n')) {
            const u = unitNum(ln);
            if (u !== null) { started = true; inFocus = (u === focusNum); }
            const h = esc(ln) + '<br>';
            if (!started) out += h;                                    // 조 제목·도입부(공통)
            else out += inFocus ? `<span class="lq-hl-focus">${h}</span>`
                                : `<span class="lq-hl-dim">${h}</span>`;
        }
        return out;
    }


}