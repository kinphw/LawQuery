/**
 * LawQuery 인증 게이트 (classic script — 반드시 <head>에서, 번들보다 "먼저" 로드)
 *
 * 핵심 원칙: "확인 전에는 아무것도 보여주지 않는다."
 *   - 즉시 <html>을 숨김(lq-auth-checking) → 콘텐츠가 한 번도 깜빡이지 않음.
 *   - /api/auth/me 로 인증을 먼저 확인:
 *       · 인증+승인됨 → 숨김 해제(표시)
 *       · 아니면      → login.html로 즉시 이동 (콘텐츠는 끝내 노출되지 않음)
 *   - 앱 자동진입(?src=app&t=)은 토큰으로 app-enter 후 깨끗한 URL로 재시작.
 *   - fetch 인터셉터는 "세션 도중 만료" 같은 사후 케이스의 안전망.
 */
(function () {
  var LOGIN = 'login.html';
  var docEl = document.documentElement;

  // 1) 즉시 숨김 (paint 전에 실행되도록 head에서 동기 로드되어야 함)
  docEl.classList.add('lq-auth-checking');
  var style = document.createElement('style');
  style.textContent =
    '.lq-auth-checking body{visibility:hidden!important}' +
    '.lq-userbar{display:flex;align-items:center;justify-content:flex-end;gap:.75rem;' +
      'padding:.4rem .9rem;background:#212529;color:#fff;font-size:.85rem;' +
      'position:sticky;top:0;z-index:1100}' +
    '.lq-userbar__who{margin-right:auto}' +
    '.lq-userbar__badge{background:#0d6efd;color:#fff;border-radius:.25rem;' +
      'padding:.05rem .4rem;font-size:.7rem;margin-left:.25rem}' +
    '.lq-userbar__actions{display:flex;align-items:center;gap:.75rem}' +
    '.lq-userbar__link{color:#cfe2ff;background:none;border:0;cursor:pointer;' +
      'text-decoration:none;font-size:.85rem;padding:0}' +
    '.lq-userbar__link:hover{color:#fff;text-decoration:underline}';
  (document.head || docEl).appendChild(style);

  function reveal() { docEl.classList.remove('lq-auth-checking'); }

  /**
   * 로그인 상태바를 #header(없으면 body 최상단)에 렌더.
   * 앱 익명계정(source=app, email=device_xxx@auto.lq)은 이메일 대신 "앱 사용자"로 표기.
   */
  function renderStatusBar(me) {
    // head에서 실행 중 me 응답이 body 파싱보다 빨리 오면 document.body가 null일 수 있다.
    // 그 경우 DOMContentLoaded까지 기다렸다가 다시 그린다. (law/index 로딩 타이밍 차이로 인한 누락 방지)
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', function () { renderStatusBar(me); });
      return;
    }
    // 번들이 #header에 자체 헤더를 그리므로, 상태바는 충돌을 피해
    // body 최상단에 별도 컨테이너(#lq-userbar-host)로 둔다.
    var host = document.getElementById('lq-userbar-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'lq-userbar-host';
      document.body.insertBefore(host, document.body.firstChild);
    }
    var who;
    if (me.displayName) who = me.displayName;
    else if (me.source === 'app') who = '앱 사용자';
    else who = me.email || '사용자';

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
          adminLink +
          '<button type="button" id="lqRenameBtn" class="lq-userbar__link">이름변경</button>' +
          '<button type="button" id="lqLogoutBtn" class="lq-userbar__link">로그아웃</button>' +
        '</span>' +
      '</div>';

    var logoutBtn = document.getElementById('lqLogoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function () {
        origFetch('/api/auth/logout', { method: 'POST' }).then(function () {
          location.href = LOGIN;
        });
      });
    }

    var renameBtn = document.getElementById('lqRenameBtn');
    if (renameBtn) {
      renameBtn.addEventListener('click', function () {
        var current = (me.displayName && me.source !== 'app') ? me.displayName : '';
        var name = window.prompt('표시할 이름을 입력하세요 (1~50자)', current);
        if (name === null) return;          // 취소
        name = name.trim();
        if (!name) { alert('이름을 입력해 주세요.'); return; }
        origFetch('/api/auth/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ displayName: name }),
        })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (data.success) {
              var el = document.getElementById('lqWho');
              if (el) el.textContent = data.displayName;
              me.displayName = data.displayName;
            } else {
              alert(data.error || '이름 변경에 실패했습니다.');
            }
          })
          .catch(function () { alert('서버 연결에 실패했습니다.'); });
      });
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function gotoLogin() {
    var next = encodeURIComponent(location.pathname.replace(/^\//, '') + location.search);
    location.replace(LOGIN + '?next=' + next);
  }

  var origFetch = window.fetch.bind(window);
  var redirecting = false;

  // 2) fetch 인터셉터 (세션 만료 등 사후 안전망)
  window.fetch = function (input, init) {
    return origFetch(input, init).then(function (res) {
      try {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        var isApi = url.indexOf('/api/') !== -1;
        var isAuthApi = url.indexOf('/api/auth/') !== -1;
        if (isApi && !isAuthApi && (res.status === 401 || res.status === 403) && !redirecting) {
          redirecting = true;
          gotoLogin();
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

  // 페이지 접근 기록 (비로그인 포함). 실패해도 무시 — UX 영향 없음.
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
    redirecting = true; // 처리 끝까지 화면 숨김 유지
    origFetch('/api/auth/app-enter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ t: params.get('t'), deviceKey: getDeviceKey() }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.success) location.replace(location.pathname); // 깨끗한 URL로 재시작
        else location.replace(LOGIN);
      })
      .catch(function () { location.replace(LOGIN); });
    return;
  }

  // 일반 진입: 페이지 접근 기록 (앱 자동진입은 깨끗한 URL 재시작 후 이 분기로 들어와 기록됨)
  recordVisit();

  // 3-B) 일반 웹: 선(先) 인증 확인
  origFetch('/api/auth/me', { headers: { 'Accept': 'application/json' } })
    .then(function (r) { return r.json(); })
    .then(function (me) {
      if (me && me.authenticated) {
        renderStatusBar(me); // 상단 로그인 상태바
        reveal(); // 인증+승인 → 표시
      } else {
        redirecting = true;
        gotoLogin(); // 미인증/미승인 → 콘텐츠 노출 없이 이동
      }
    })
    .catch(function () {
      // 서버 응답 불가 시: 안전하게 숨김 유지 후 로그인으로
      redirecting = true;
      gotoLogin();
    });
})();
