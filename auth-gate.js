/**
 * LawQuery 인증 게이트 (classic script — 반드시 <head>에서, 번들보다 "먼저" 로드)
 *
 * 정책 변경(free/pro 게이팅):
 *   - "본문은 비로그인 개방" → 미로그인도 콘텐츠를 본다(로그인 벽 제거).
 *   - /api/auth/me 로 상태를 확인해 상단 바만 분기(로그인 사용자 / 게스트).
 *   - me 결과는 window.__lqMePromise 로 노출 → 번들(law/interpretation)이 plan을 보고
 *     무료 단일뷰 / PRO 연계표를 분기한다(중복 fetch 방지).
 *   - 보호 API(PRO 전용)가 401/403을 줘도 더 이상 로그인으로 강제 이동하지 않는다.
 *     잠금/가입 유도 UI는 각 화면(컨트롤러)이 직접 처리한다.
 *   - 앱(TWA)은 저장된 토큰(lq_app_token)으로 세션 만료 시 조용히 자동 재진입한다.
 *   - account.html·admin.html 등 "로그인 필수" 페이지는 자체 me 체크로 보호한다.
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
    '.lq-userbar__badge--pro{background:#6f42c1}' +
    '.lq-userbar__badge--free{background:#6c757d}' +
    '.lq-userbar__actions{display:flex;align-items:center;gap:.75rem}' +
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

  /**
   * 로그인 상태바. 앱 익명계정은 "앱 사용자"로 표기. plan 뱃지(PRO/FREE) 표시.
   */
  function renderStatusBar(me) {
    var host = ensureUserbarHost(function () { renderStatusBar(me); });
    if (!host) return;

    var who;
    if (me.displayName) who = me.displayName;
    else if (me.source === 'app') who = '앱 사용자';
    else who = me.loginId || '사용자';

    var isPro = me.plan === 'pro';
    var planBadge = isPro
      ? '<span class="lq-userbar__badge lq-userbar__badge--pro">PRO</span>'
      : '<span class="lq-userbar__badge lq-userbar__badge--free">FREE</span>';

    var adminLink = me.role === 'admin'
      ? '<a href="admin.html" class="lq-userbar__link">관리자</a>' : '';

    host.innerHTML =
      '<div class="lq-userbar">' +
        '<span class="lq-userbar__who">' +
          '<i class="fas fa-user-circle"></i> ' +
          '<strong id="lqWho">' + escapeHtml(who) + '</strong>' +
          planBadge +
          (me.role === 'admin' ? ' <span class="lq-userbar__badge">관리자</span>' : '') +
        '</span>' +
        '<span class="lq-userbar__actions">' +
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
  }

  /** 게스트(비로그인) 상태바 — 로그인 벽 대신 가입 유도 CTA. */
  function renderGuestBar() {
    var host = ensureUserbarHost(renderGuestBar);
    if (!host) return;
    var next = encodeURIComponent(location.pathname.replace(/^\//, '') + location.search);
    host.innerHTML =
      '<div class="lq-userbar">' +
        '<span class="lq-userbar__who">' +
          '<i class="fas fa-user-circle"></i> 둘러보는 중' +
        '</span>' +
        '<span class="lq-userbar__actions">' +
          '<a href="board.html" class="lq-userbar__link">건의사항</a>' +
          '<a href="' + LOGIN + '?next=' + next + '" class="lq-userbar__link">로그인</a>' +
          '<a href="' + LOGIN + '?next=' + next + '" class="lq-userbar__cta">가입(무료)</a>' +
        '</span>' +
      '</div>';
    exposeUserbarHeight(host);
  }

  // 가입 직후 1회 온보딩: "PRO 전 기능 베타 무료" 인지. login.html이 가입 성공 시 플래그를 심는다.
  function maybeShowOnboarding(me) {
    var FLAG = 'lq_onboard_pro';
    try { if (!localStorage.getItem(FLAG)) return; } catch (e) { return; }
    var isPro = me && me.plan === 'pro';
    try { localStorage.removeItem(FLAG); } catch (e) { /* noop */ }
    if (!isPro) return;
    function show() {
      if (document.getElementById('lq-onboard')) return;
      var ov = document.createElement('div');
      ov.id = 'lq-onboard';
      ov.setAttribute('style',
        'position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,.5);' +
        'display:flex;align-items:center;justify-content:center;padding:1rem');
      ov.innerHTML =
        '<div style="max-width:420px;background:#fff;border-radius:.6rem;padding:1.5rem;' +
          'text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.25)">' +
          '<div style="font-size:2rem">🎉</div>' +
          '<h5 style="margin:.5rem 0 .25rem">가입 완료 — PRO 베타 활성화</h5>' +
          '<p style="color:#555;font-size:.92rem;margin:0 0 1rem">' +
            '<strong>5단 연계표·유권해석·벌칙·별표</strong> 등 모든 <strong>PRO 기능</strong>을 ' +
            '<strong>베타 기간 무료</strong>로 이용하실 수 있어요.<br>' +
            '정식 출시 시 유료 전환 예정입니다.</p>' +
          '<button id="lq-onboard-ok" style="background:#6f42c1;color:#fff;border:0;' +
            'border-radius:.4rem;padding:.5rem 1.4rem;font-size:.95rem;cursor:pointer">시작하기</button>' +
        '</div>';
      document.body.appendChild(ov);
      var ok = document.getElementById('lq-onboard-ok');
      if (ok) ok.addEventListener('click', function () { ov.remove(); });
      ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
    }
    if (document.body) show();
    else document.addEventListener('DOMContentLoaded', show);
  }

  // 앱(저장된 토큰 보유)이면 세션 만료 시 조용히 자동 재진입.
  function appReentry() {
    var appToken = localStorage.getItem('lq_app_token');
    if (!appToken) return false;
    location.replace(location.pathname + '?src=app&t=' + encodeURIComponent(appToken));
    return true;
  }

  var origFetch = window.fetch.bind(window);
  var reentering = false;

  // 2) fetch 인터셉터: 앱 세션 만료 자동 재진입만 담당.
  //    (웹은 더 이상 401/403에 로그인으로 강제 이동하지 않는다 — 화면별 잠금 UI가 처리)
  window.fetch = function (input, init) {
    return origFetch(input, init).then(function (res) {
      try {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        var isApi = url.indexOf('/api/') !== -1;
        var isAuthApi = url.indexOf('/api/auth/') !== -1;
        if (isApi && !isAuthApi && res.status === 401 && !reentering) {
          if (localStorage.getItem('lq_app_token')) { reentering = true; appReentry(); }
        }
      } catch (e) { /* noop */ }
      return res;
    });
  };

  function getDeviceKey() {
    var k = localStorage.getItem('lq_device_key');
    if (!k) {
      var arr = new Uint8Array(16);
      (window.crypto || window.msCrypto).getRandomValues(arr);
      k = Array.prototype.map.call(arr, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
      localStorage.setItem('lq_device_key', k);
    }
    return k;
  }

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
      }).catch(function () { /* noop */ });
    } catch (e) { /* noop */ }
  }

  var params = new URLSearchParams(location.search);

  // 3-A) 앱 자동진입
  if (params.get('src') === 'app' && params.get('t')) {
    reentering = true; // 처리 끝까지 화면 숨김 유지
    var appToken = params.get('t');
    try { localStorage.setItem('lq_app_token', appToken); } catch (e) { /* noop */ }
    origFetch('/api/auth/app-enter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ t: appToken, deviceKey: getDeviceKey() }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.success) location.replace(location.pathname); // 깨끗한 URL로 재시작
        else location.replace(LOGIN);
      })
      .catch(function () { location.replace(LOGIN); });
    return;
  }

  // 일반 진입: 접근 기록 + 배너
  recordVisit();
  if (document.body) showBanner();
  else document.addEventListener('DOMContentLoaded', showBanner);

  // 3-B) 상태 확인 → 상태바 분기 + reveal. me 결과는 번들이 쓰도록 노출.
  var mePromise = origFetch('/api/auth/me', { headers: { 'Accept': 'application/json' } })
    .then(function (r) { return r.json(); })
    .catch(function () { return { authenticated: false }; });

  // 번들(law/interpretation)이 plan 분기에 사용 (중복 fetch 방지)
  window.__lqMePromise = mePromise;

  mePromise.then(function (me) {
    if (me && me.authenticated) {
      renderStatusBar(me);
      reveal(); // 로그인/게스트 모두 콘텐츠 표시
      maybeShowOnboarding(me); // 가입 직후 1회 PRO 안내
    } else {
      renderGuestBar();
      reveal();
    }
  });
})();
