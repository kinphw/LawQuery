import { ILawController } from "../LawController";
import { ILawEventManager } from "./ILawEventManager";

export class LawTextSizeEventManager implements ILawEventManager {
    constructor(private controller: ILawController) {}

    bindEvents(): void {
        this.bindTextSizeEvents();
    }

    private bindTextSizeEvents(): void {
        document.querySelectorAll('input[name="textSize"]').forEach(radio => {
            radio.addEventListener('change', (e: Event) => this.handleTextSizeChange(e));
        });
    }

    /**
     * 글자크기 변경 — 재렌더하지 않고 셀 클래스만 바꾼 뒤, '보던 조문'을 기준으로 스크롤을 되돌린다.
     *
     * 예전엔 currentResults 로 표 전체를 다시 그렸는데, 그러면 (1) 스크롤이 픽셀 기준이라 글자크기
     * 변화만큼 다른 조문이 보이고 (2) 윈도잉 placeholder·content-visibility 실측높이까지 초기화돼
     * 위치가 더 크게 튀었다. 겸사겸사 글자검색 결과가 전체표로 되돌아가던 문제도 사라진다.
     */
    private handleTextSizeChange(e: Event): void {
        const target = e.target as HTMLInputElement;

        const anchor = this.controller.view.captureScrollAnchor();  // 변경 전 위치 기록
        this.controller.view.applyTextSize(target.value);           // 클래스만 교체(DOM·이벤트 유지)
        this.controller.view.restoreScrollAnchor(anchor);           // 같은 조문이 같은 자리에 오도록

        this.controller.view.showToast('글자크기 변경');
    }
}