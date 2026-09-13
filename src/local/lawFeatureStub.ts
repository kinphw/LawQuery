/**
 * 로컬판에서 빼는 기능들의 자리 채우기 — 이벤트매니저 두 개를 대체한다(webpack 치환).
 *
 *   LawExportEventManager   → 'HTML 저장'  : 오프라인 사본 자체가 이미 로컬 파일이라 뜻이 없다.
 *   LawRevisionEventManager → '개정비교'   : 로컬판에서는 제공하지 않기로 했다.
 *
 * 이벤트만 안 붙이면 버튼은 남아 눌러도 반응이 없는 상태가 되므로, 스텁이 **버튼을 DOM 에서
 * 치워** 애초에 보이지 않게 한다. 덕분에 HTML 은 호스팅판 원본 그대로 쓸 수 있다.
 *
 * 원본이 구현하는 인터페이스(bindEvents 하나)만 맞추면 되고, LawController 는 이 객체를
 * 다른 이벤트매니저와 똑같이 배열에 담아 돌린다 — 컨트롤러는 손대지 않는다.
 */

/** 로컬판에서 감출 버튼들. lawViewTabs = 기본조회|연혁비교 탭(로컬판은 연혁 아카이브를 싣지 않는다). */
const HIDDEN_BUTTON_IDS = ['lawExportBtn', 'lawRevisionBtn', 'lawViewTabs'];

function removeHiddenButtons(): void {
  for (const id of HIDDEN_BUTTON_IDS) {
    const el = document.getElementById(id);
    // 버튼 앞뒤 공백만 남는 것을 피하려고 요소 자체를 들어낸다.
    if (el) el.remove();
  }
}

class DisabledFeature {
  constructor(_controller?: unknown) { }

  bindEvents(): void {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', removeHiddenButtons, { once: true });
    } else {
      removeHiddenButtons();
    }
  }
}

// 원본 모듈들과 같은 이름으로 내보낸다(치환 대상이 어느 쪽이든 맞물리도록).
export class LawExportEventManager extends DisabledFeature { }
export class LawRevisionEventManager extends DisabledFeature { }
export default DisabledFeature;
