/**
 * 조(article) 단위 스크롤 위치 저장·복원.
 *
 * 문제: 모바일 브라우저가 백그라운드 탭을 폐기(discard)했다가 복귀 시 자동 리로드하는데,
 * 브라우저의 기본 스크롤 복원은 '픽셀 y값' 기준이다. 대형 표는 윈도잉(content-visibility +
 * contain-intrinsic-size 추정 높이)이라 리로드 직후의 픽셀 y가 리로드 전과 다른 조를 가리켜
 * "돌아오면 위치가 바뀌는" 현상이 생긴다(회원바·배너의 늦은 삽입도 밀림을 보탬).
 *
 * 해법: 픽셀 대신 '뷰포트 상단에 보이는 조'를 sessionStorage에 기록하고,
 * 리로드/뒤로가기 복귀 시 그 조의 앵커(tr#fa-…)로 복원한다(entry에서 scrollRestoration을
 * manual로 꺼 픽셀 복원과의 충돌 차단). 앵커 기준이라 추정 높이와 무관하게 정확하고,
 * scroll-margin-top(회원바 가림 방지)도 그대로 적용된다.
 */
export class ForeignScrollAnchor {
  private key: string;
  private saveTimer: number | null = null;
  private userMoved = false; // 복원 재정렬 중 사용자가 직접 스크롤하면 중단

  constructor(code: string) {
    this.key = 'fm_pos_' + code;
  }

  /** 렌더 완료 후 1회 호출 — 복귀(리로드/뒤로가기)면 저장된 조로 복원하고, 위치 감시를 시작한다. */
  start(): void {
    this.restore();
    this.watch();
  }

  // ── 복원 ──────────────────────────────────────────────────────────────

  private restore(): void {
    // 신규 진입(navigate)은 복원하지 않는다 — 카탈로그에서 새로 연 법은 처음부터 보는 게 자연스러움.
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (!nav || (nav.type !== 'reload' && nav.type !== 'back_forward')) return;

    let id: string | null = null;
    try { id = sessionStorage.getItem(this.key); } catch { return; }
    if (!id) return;

    const jump = (): void => {
      if (this.userMoved) return; // 사용자가 이미 움직였으면 강제 재정렬하지 않음
      document.getElementById(id!)?.scrollIntoView(); // scroll-margin-top 적용, scroll-behavior:auto라 즉시
    };
    jump();
    // 윈도잉 표는 점프 후 주변 조들이 실측 높이로 갱신되며 목표가 밀린다 → 몇 차례 재정렬로 수렴.
    // 늦은 패스(250/800ms)는 회원바(/api/auth/me 후 삽입)·배너의 뒤늦은 밀림을 흡수한다.
    requestAnimationFrame(() => { jump(); requestAnimationFrame(jump); });
    window.setTimeout(jump, 250);
    window.setTimeout(jump, 800);

    // 재정렬 유예 동안 사용자 개입 감지(개입 시 이후 패스 중단)
    const markMoved = (): void => { this.userMoved = true; };
    for (const ev of ['wheel', 'touchstart', 'keydown'] as const) {
      window.addEventListener(ev, markMoved, { passive: true, once: true });
    }
  }

  // ── 저장 ──────────────────────────────────────────────────────────────

  private watch(): void {
    // 스크롤 중 쓰로틀 저장 + 탭 이탈(hidden) 순간 즉시 저장(폐기 직전의 마지막 기회)
    window.addEventListener('scroll', () => {
      if (this.saveTimer !== null) return;
      this.saveTimer = window.setTimeout(() => { this.saveTimer = null; this.save(); }, 400);
    }, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.save();
    });
  }

  /** 뷰포트 상단(회원바 아래)에 걸쳐 있는 조의 앵커 id를 기록. */
  private save(): void {
    const userbarH = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--lq-userbar-h')) || 0;
    const threshold = userbarH + 12;

    let current: string | null = null;
    // 조 그룹(tbody)은 문서 순서로 정렬 — 상단을 지난 마지막 그룹이 '현재 조'. 지나치면 중단.
    // (그룹 박스는 윈도잉으로 내용이 skip돼도 intrinsic-size로 유효한 좌표를 가진다)
    for (const tb of Array.from(document.querySelectorAll('tbody.fm-art-group'))) {
      const r = (tb as HTMLElement).getBoundingClientRect();
      if (r.top > threshold) break;
      const head = tb.querySelector('tr.fm-art-head');
      if (head && head.id) current = head.id;
    }
    try {
      if (current) sessionStorage.setItem(this.key, current);
      else sessionStorage.removeItem(this.key); // 최상단(첫 조 이전)이면 복원 불필요
    } catch { /* 시크릿 모드 등 저장 불가 — 무해 */ }
  }
}
