/**
 * 로컬판 인증 게이트 (classic script — <head> 에서 번들보다 먼저 로드)
 *
 * 호스팅판 auth-gate.js 를 대체한다. 배포본에서 같은 파일명(auth-gate.js)으로 덮어쓰므로
 * HTML 은 손대지 않는다.
 *
 * 호스팅판은 여기서 /api/auth/me 를 호출하지만, 그 시점엔 번들(= 로컬 API 가로채기)이
 * 아직 로드되지 않았다. 그래서 로컬판은 네트워크를 타지 않고 결과를 즉시 확정한다.
 *   - window.__lqMePromise : 번들이 로그인 상태 확인에 사용 → 항상 로그인됨
 *   - 상단 바 : 로그인/가입/계정 대신 "오프라인 사본" 표시
 */
(function () {
  var ME = {
    authenticated: true,
    status: 'approved',
    role: 'admin',
    displayName: '로컬 오프라인판',
    source: 'local',
    remember: true,
  };

  // 번들이 중복 fetch 없이 바로 쓰도록 노출 (호스팅판과 동일한 계약).
  window.__lqMePromise = Promise.resolve(ME);

  // 서비스워커 비활성화 — 오프라인 사본은 이미 모든 파일이 로컬에 있어 캐싱이 무의미하고,
  // 오히려 낡은 사본을 붙잡아 둔다. 페이지가 등록을 시도해도 조용히 흘려보낸다.
  if ('serviceWorker' in navigator) {
    try {
      navigator.serviceWorker.getRegistrations().then(function (regs) {
        regs.forEach(function (r) { r.unregister(); });
      }).catch(function () { /* noop */ });
    } catch (e) { /* noop */ }
    navigator.serviceWorker.register = function () { return Promise.resolve(); };
  }

  var docEl = document.documentElement;

  // 로컬판에 들어 있지 않은 페이지로 가는 링크를 감춘다.
  // (해외법령·게시판·로그인·관리자 등 — 누르면 파일이 없어 빈 화면이 된다)
  // 헤더는 번들이 나중에 그리므로 DOM 을 지우는 방식은 타이밍을 타지만, CSS 는 언제 그려지든 걸린다.
  var ABSENT_PAGES = [
    'foreign.html', 'foreign-transition.html', 'board.html', 'account.html',
    'admin.html', 'login.html', 'privacy.html', 'account-deletion.html',
  ];
  // 이동 방식이 두 가지다 — <a href="foreign.html"> 와 <button onclick="location.href='foreign.html'">.
  // 헤더 내비게이션은 후자라서 href 선택자만으로는 걸리지 않는다.
  var hideRules = ABSENT_PAGES
    .map(function (p) {
      return 'a[href="' + p + '"],a[href^="' + p + '?"],[onclick*="' + p + '"]';
    })
    .join(',') + '{display:none!important}';

  var style = document.createElement('style');
  style.textContent =
    hideRules +
    '.lq-userbar{display:flex;align-items:center;justify-content:flex-end;gap:.75rem;' +
      'padding:.4rem .9rem;background:#212529;color:#fff;font-size:.85rem;' +
      'position:sticky;top:0;z-index:1030}' +
    '.lq-userbar__who{margin-right:auto}' +
    '.lq-userbar__badge{background:#198754;color:#fff;border-radius:.25rem;' +
      'padding:.05rem .4rem;font-size:.7rem;margin-left:.25rem}' +
    '.lq-userbar__note{color:#adb5bd;font-size:.78rem}';
  (document.head || docEl).appendChild(style);

  function render() {
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', render);
      return;
    }
    var host = document.getElementById('lq-userbar-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'lq-userbar-host';
      document.body.insertBefore(host, document.body.firstChild);
    }
    host.innerHTML =
      '<div class="lq-userbar">' +
        '<span class="lq-userbar__who">' +
          '<i class="fas fa-hdd"></i> 오프라인 사본' +
          '<span class="lq-userbar__badge">전체 기능</span>' +
        '</span>' +
        '<span class="lq-userbar__note" id="lqLocalStamp">인터넷 연결 없이 동작합니다</span>' +
      '</div>';

    try {
      docEl.style.setProperty('--lq-userbar-h', (host.offsetHeight || 0) + 'px');
    } catch (e) { /* noop */ }

    // 데이터 기준일(추출 시각)을 표시 — 배포본이 얼마나 오래된 사본인지 한눈에 보이게.
    // file:// 배포본은 데이터 스크립트에 기준일이 심어져 있어 fetch 가 필요 없다.
    var stampEl = document.getElementById('lqLocalStamp');
    if (window.LQ_OFFLINE_STAMP && stampEl) {
      stampEl.textContent = '데이터 기준: ' + window.LQ_OFFLINE_STAMP;
    } else if (location.protocol !== 'file:') {
      fetch('db/manifest.json')
        .then(function (r) { return r.json(); })
        .then(function (m) {
          var el = document.getElementById('lqLocalStamp');
          if (el && m && m.generated_at) {
            el.textContent = '데이터 기준: ' + m.generated_at;
          }
        })
        .catch(function () { /* noop */ });
    }
  }

  render();
})();
