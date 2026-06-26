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

    showOriginLawModal(content: string, chain: Array<{ origin: string; id: string; content: string }> = []) {
        const modal = document.getElementById('originLawModal');
        const TIER: Record<string, string> = { a: '법', e: '시행령', s: '감독규정', r: '세칙' };
        const preStyle = "white-space:pre-wrap; font-family:'Noto Sans KR','Noto Sans','Malgun Gothic',"
            + "'Apple SD Gothic Neo',Arial,'Segoe UI',monospace; line-height:1.7; letter-spacing:0.01em;";
        // 위임 하위(시행령 등) — '진짜 원인규정'까지 따라가 표시
        const chainHtml = chain.map(c =>
            `<div class="mt-3 mb-1"><span class="badge bg-secondary">위임 ${TIER[c.origin] ?? c.origin}</span></div>`
            + `<pre class="small mb-0" style="${preStyle}">${c.content}</pre>`).join('');
        if (modal) {
            modal.querySelector('.modal-title')!.textContent =
                chain.length ? '원문(법) + 위임 하위규정' : '원문(법) 전체 보기';
            modal.querySelector('.modal-body')!.innerHTML =
                `<pre class="small mb-0" style="${preStyle}">${content}</pre>${chainHtml}`;
            // @ts-ignore — 요소당 인스턴스 1개만(백드롭 중복·잔류 방지)
            const bsModal = bootstrap.Modal.getOrCreateInstance(modal);
            bsModal.show();
        } else {
            alert(content);
        }
    }


}