/**
 * UpsellNotice — 잠긴 영역을 대신하는 "회원가입 시 전체 조회" 안내 플레이스홀더.
 *
 * 중요: 실제 콘텐츠(연계표 나머지 조·유권해석 나머지 건)는 서버가 애초에 내려주지 않으므로
 * 여기엔 진짜 데이터가 들어가지 않는다(무유출). 흐린 막대는 순수 장식이다.
 * "베타/PRO" 같은 표현 대신 "회원가입 시 전체 조회 가능"으로 순화한다.
 */
export class UpsellNotice {
  /** 안내 플레이스홀더 HTML. message는 무엇이 더 보이는지 한 줄 설명. */
  static html(message: string): string {
    const next = encodeURIComponent(location.pathname.replace(/^\//, '') + location.search);
    const bar = (w: number) =>
      `<div style="height:1.05rem;background:#dee2e6;border-radius:.3rem;margin:.55rem 0;width:${w}%"></div>`;
    return `
      <div class="lq-upsell" style="position:relative;margin:.25rem 0 2rem">
        <div aria-hidden="true" style="filter:blur(3px);opacity:.5;pointer-events:none;user-select:none;padding:.5rem 0">
          ${bar(94)}${bar(86)}${bar(90)}${bar(78)}${bar(88)}${bar(82)}
        </div>
        <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;
                    justify-content:center;gap:.7rem;text-align:center;padding:1rem;
                    background:linear-gradient(to bottom, rgba(248,249,250,0), rgba(248,249,250,.92) 42%)">
          <div class="text-secondary"><i class="fas fa-lock"></i> ${UpsellNotice.esc(message)}</div>
          <a href="login.html?next=${next}" class="btn btn-primary">회원가입하고 전체 보기</a>
        </div>
      </div>`;
  }

  /** 컨테이너 안쪽 끝에 안내를 덧붙인다(렌더된 표/목록 아래). */
  static appendInside(containerId: string, message: string): void {
    const host = document.getElementById(containerId);
    if (!host) return;
    host.insertAdjacentHTML('beforeend', UpsellNotice.html(message));
  }

  private static esc(s: string): string {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
    );
  }
}
