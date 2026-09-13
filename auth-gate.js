/**
 * LawQuery 인증 게이트 (classic script — 반드시 <head>에서, 번들보다 "먼저" 로드)
 *
 * 정책(2026-09-01, 1인 사용 체제 — 전면 로그인 벽):
 *   - 비로그인은 아무것도 못 본다. me 확인 후 미로그인이면 즉시 login.html 로 보낸다.
 *     (그 전까진 body 를 숨긴 상태이므로 콘텐츠가 한 순간도 노출되지 않는다.)
 *   - 데이터 차단의 본체는 백엔드다(src/backend/ts/index.ts 의 app.use('/api', authGuard)).
 *     이 스크립트는 화면 전환만 담당한다 — 정적 HTML 은 Apache 가 그냥 주기 때문.
 *   - 접근 기록(page_visit)은 리다이렉트 전에 keepalive 로 발사한다(비로그인 접근도 관재 대상).
 *   - me 결과는 window.__lqMePromise 로 노출 → 번들이 관리자 여부 확인에 재사용(중복 fetch 방지).
 *   - login.html·privacy.html 등은 이 스크립트를 로드하지 않는다(무한 이동 방지).
 *   - account.html·admin.html 등 "로그인 필수" 페이지는 자체 me 체크로도 보호된다.
 */
(function () {
  var LOGIN = 'login.html';
  var docEl = document.documentElement;

  // 1) 즉시 숨김 → me 확인 후 reveal (콘텐츠 깜빡임 방지). 게스트도 reveal 한다.
  docEl.classList.add('lq-auth-checking');
  var style = document.createElement('style');
  style.textContent =
    '.lq-auth-checking body{visibility:hidden!important}' +
    // z-index는 Bootstrap 모달(1055)/백드롭(1050)보다 낮게 둬서,
    // 전체화면 모달(별표/벌칙)이 열리면 상태바를 덮도록 한다(상단 잘림 방지).
    '.lq-userbar{display:flex;align-items:center;justify-content:flex-end;gap:.75rem;' +
      'padding:.4rem .9rem;background:#212529;color:#fff;font-size:.85rem;' +
      'position:sticky;top:0;z-index:1030}' +
    '.lq-userbar__who{margin-right:auto}' +
    '.lq-userbar__badge{background:#0d6efd;color:#fff;border-radius:.25rem;' +
      'padding:.05rem .4rem;font-size:.7rem;margin-left:.25rem}' +
    '.lq-userbar__actions{display:flex;align-items:center;gap:.75rem;flex-wrap:wrap}' +
    '.lq-userbar__remember{display:flex;align-items:center;gap:.2rem;color:#cfe2ff;' +
      'font-size:.8rem;cursor:pointer;user-select:none}' +
    '.lq-userbar__remember input{cursor:pointer;margin:0}' +
    '.lq-userbar__link{color:#cfe2ff;background:none;border:0;cursor:pointer;' +
      'text-decoration:none;font-size:.85rem;padding:0}' +
    '.lq-userbar__link:hover{color:#fff;text-decoration:underline}' +
    '.lq-userbar__cta{color:#fff;background:#0d6efd;border-radius:.25rem;' +
      'padding:.15rem .6rem;text-decoration:none;font-size:.8rem}' +
    '.lq-userbar__cta:hover{background:#0b5ed7;color:#fff}';
  (document.head || docEl).appendChild(style);

  function reveal() { docEl.classList.remove('lq-auth-checking'); }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function ensureUserbarHost(cb) {
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', function () { cb(); });
      return null;
    }
    var host = document.getElementById('lq-userbar-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'lq-userbar-host';
      document.body.insertBefore(host, document.body.firstChild);
    }
    return host;
  }

  function exposeUserbarHeight(host) {
    try {
      var h = host.offsetHeight || 0;
      docEl.style.setProperty('--lq-userbar-h', h + 'px');
    } catch (e) { /* noop */ }
  }

  /** 로그인 상태바. 앱 익명계정은 "앱 사용자"로 표기. */
  function renderStatusBar(me) {
    var host = ensureUserbarHost(function () { renderStatusBar(me); });
    if (!host) return;

    var who;
    if (me.displayName) who = me.displayName;
    else if (me.source === 'app') who = '앱 사용자';
    else who = me.loginId || '사용자';

    var adminLink = me.role === 'admin'
      ? '<a href="admin.html" class="lq-userbar__link">관리자</a>' : '';

    host.innerHTML =
      '<div class="lq-userbar">' +
        '<span class="lq-userbar__who">' +
          '<i class="fas fa-user-circle"></i> ' +
          '<strong id="lqWho">' + escapeHtml(who) + '</strong>' +
          (me.role === 'admin' ? ' <span class="lq-userbar__badge">관리자</span>' : '') +
        '</span>' +
        '<span class="lq-userbar__actions">' +
          '<label class="lq-userbar__remember" title="체크하면 30일간 로그인 유지">' +
            '<input type="checkbox" id="lqRemember"' + (me.remember ? ' checked' : '') + '> 로그인 유지' +
          '</label>' +
          adminLink +
          '<a href="board.html" class="lq-userbar__link">건의사항</a>' +
          '<a href="account.html" class="lq-userbar__link">내 계정</a>' +
          '<button type="button" id="lqLogoutBtn" class="lq-userbar__link">로그아웃</button>' +
        '</span>' +
      '</div>';

    exposeUserbarHeight(host);

    var logoutBtn = document.getElementById('lqLogoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function () {
        origFetch('/api/auth/logout', { method: 'POST' }).then(function () {
          location.reload();
        });
      });
    }

    // "로그인 유지" 토글 → 장기(30일)/단기(30분) 쿠키로 재발급
    var remember = document.getElementById('lqRemember');
    if (remember) {
      remember.addEventListener('change', function () {
        remember.disabled = true;
        origFetch('/api/auth/remember', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ remember: remember.checked }),
        }).then(function () { remember.disabled = false; })
          .catch(function () { remember.disabled = false; });
      });
    }
  }

  /**
   * 비로그인 → 로그인 화면으로 이동. 콘텐츠는 계속 숨긴 채(reveal 하지 않음) 전환한다.
   * replace 를 쓰는 이유: 뒤로가기로 숨겨진 페이지에 되돌아오는 것을 막기 위함.
   */
  function gotoLogin() {
    if (/(^|\/)login\.html$/i.test(location.pathname)) { reveal(); return; } // 자기참조 방어
    var here = location.pathname.replace(/^\//, '') + location.search;
    var next = encodeURIComponent(here || 'index.html');
    location.replace(LOGIN + '?next=' + next);
  }

  var origFetch = window.fetch.bind(window);
  // (앱 자동진입/자동가입 제거됨) 웹·앱 모두 명시적 이메일 가입만 사용한다.

  // 관리자 지정 배너 표시 (모든 페이지 상단). 로그인 여부와 무관.
  function showBanner() {
    origFetch('/api/auth/banner', { headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (b) {
        if (!b || !b.enabled || !b.text) return;
        // 법령=index.html(또는 루트 '/'), 유권해석=interpretation.html
        var pageKey = /interpretation\.html$/i.test(location.pathname) ? 'interp' : 'law';
        if (b.pages && b.pages.indexOf(pageKey) === -1) return;
        var host = document.getElementById('lq-banner-host');
        if (!host) {
          host = document.createElement('div');
          host.id = 'lq-banner-host';
          if (document.body) document.body.insertBefore(host, document.body.firstChild);
        }
        var colorMap = {
          info: '#0dcaf0', warning: '#ffc107', danger: '#dc3545',
          success: '#198754', secondary: '#6c757d', primary: '#0d6efd'
        };
        var bg = colorMap[b.color] || colorMap.info;
        var fg = (b.color === 'warning' || b.color === 'info') ? '#212529' : '#fff';
        host.innerHTML =
          '<div style="background:' + bg + ';color:' + fg + ';padding:.5rem .9rem;' +
          'font-size:.9rem;text-align:center;position:sticky;top:0;z-index:1110;">' +
          escapeHtml(b.text) + '</div>';
      })
      .catch(function () { /* noop */ });
  }

  // 페이지 접근 기록 (비로그인 포함). 실패해도 무시.
  function recordVisit() {
    try {
      origFetch('/api/auth/visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: location.pathname }),
        keepalive: true, // 비로그인 리다이렉트로 문서가 떠나도 기록은 남는다
      }).catch(function () { /* noop */ });
    } catch (e) { /* noop */ }
  }

  // 진입: 접근 기록 + 배너 (앱이든 웹이든 동일 — 자동가입 없음)
  recordVisit();
  if (document.body) showBanner();
  else document.addEventListener('DOMContentLoaded', showBanner);

  // 3-B) 상태 확인 → 상태바 분기 + reveal. me 결과는 번들이 쓰도록 노출.
  var mePromise = origFetch('/api/auth/me', { headers: { 'Accept': 'application/json' } })
    .then(function (r) { return r.json(); })
    .catch(function () { return { authenticated: false }; });

  // 번들이 관리자 여부 확인에 재사용 (중복 fetch 방지)
  window.__lqMePromise = mePromise;

  mePromise.then(function (me) {
    if (me && me.authenticated) {
      renderStatusBar(me);
      reveal();
    } else {
      gotoLogin(); // 비로그인: 아무것도 보여주지 않고 로그인 화면으로
    }
  });
})();
