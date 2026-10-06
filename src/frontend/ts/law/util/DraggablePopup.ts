/**
 * 떠 있는 팝업(position:fixed) 공용 — 헤더 드래그 + 화면 안 가두기.
 *
 * mousedown/mousemove 만 쓰면 태블릿·폰에서 헤더를 끌 때 마우스 이벤트가 오지 않고
 * 페이지가 대신 스크롤된다 → Pointer Events(마우스·터치·펜 공통) + 헤더 touch-action:none
 * + pointer capture 로 손가락이 헤더를 벗어나도 끝까지 따라가게 한다.
 */
const MARGIN = 8;

/** (x, y) 에 놓되 팝업 전체가 화면 안에 남도록 끌어당긴다.
 *  오른쪽 끝 단(4·5단)에서 열면 팝업이 화면 밖으로 밀려 닫기 버튼이 가려지던 문제 방지. */
export function placeInViewport(el: HTMLElement, x: number, y: number): void {
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const left = Math.max(MARGIN, Math.min(x, vw - el.offsetWidth - MARGIN));
    const top = Math.max(MARGIN, Math.min(y, vh - el.offsetHeight - MARGIN));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
}

/** handle(헤더)을 잡아 el(팝업)을 옮긴다. 리스너는 handle 에만 달려 팝업과 함께 사라진다. */
export function makeDraggable(el: HTMLElement, handle: HTMLElement): void {
    handle.style.touchAction = 'none';
    let pointerId: number | null = null;
    let offsetX = 0;
    let offsetY = 0;

    handle.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        // 닫기 버튼 탭을 드래그로 삼키지 않는다(capture 하면 click 이 헤더로 새어 버린다)
        if ((e.target as HTMLElement).closest('button, a, input')) return;
        const rect = el.getBoundingClientRect();
        pointerId = e.pointerId;
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        handle.setPointerCapture(pointerId);
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    handle.addEventListener('pointermove', (e) => {
        if (e.pointerId !== pointerId) return;
        placeInViewport(el, e.clientX - offsetX, e.clientY - offsetY);
    });

    const end = (e: PointerEvent) => {
        if (e.pointerId !== pointerId) return;
        pointerId = null;
        document.body.style.userSelect = '';
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    handle.addEventListener('lostpointercapture', end);
}
