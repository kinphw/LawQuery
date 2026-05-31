/**
 * LawQuery 인증 게이트 (classic script — 번들 모듈보다 먼저 실행)
 *
 * 역할:
 *  1) 앱 자동진입: URL에 ?src=app&t=<APP_TOKEN> 이 있으면
 *     localStorage의 기기키로 /api/auth/app-enter 호출 → 쿠키 발급 후
 *     파라미터 없는 깨끗한 URL로 replace (이후 번들이 인증된 상태로 동작)
 *  2) 웹: fetch를 감싸 보호 API가 401/403을 주면 login.html로 리다이렉트
 *     (미로그인·세션만료·승인취소 모두 처리)
 *
 * index.html / law.html 의 번들 <script type="module"> 보다 "먼저",
 * 일반 <script> 로 로드해야 한다.
 */
(function () {
  var LOGIN = 'login.html';

  // ── 1) fetch 인터셉터: 보호 API 401/403 → 로그인으로 ──
  var origFetch = window.fetch.bind(window);
  var redirecting = false;
  window.fetch = function (input, init) {
    return origFetch(input, init).then(function (res) {
      try {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        var isApi = url.indexOf('/api/') !== -1;
        var isAuthApi = url.indexOf('/api/auth/') !== -1;
        if (isApi && !isAuthApi && (res.status === 401 || res.status === 403) && !redirecting) {
          redirecting = true;
          var next = encodeURIComponent(location.pathname.replace(/^\//, '') + location.search);
          location.href = LOGIN + '?next=' + next;
        }
      } catch (e) { /* noop */ }
      return res;
    });
  };

  // ── 2) 앱 자동진입 처리 ──
  function getDeviceKey() {
    var k = localStorage.getItem('lq_device_key');
    if (!k) {
      var arr = new Uint8Array(16);
      (window.crypto || window.msCrypto).getRandomValues(arr);
      k = Array.prototype.map.call(arr, function (b) {
        return ('0' + b.toString(16)).slice(-2);
      }).join('');
      localStorage.setItem('lq_device_key', k);
    }
    return k;
  }

  var params = new URLSearchParams(location.search);
  if (params.get('src') === 'app' && params.get('t')) {
    // 앱 진입 처리 중에는 번들이 API 401을 받아도 로그인으로 튕기지 않도록 잠금.
    // (app-enter 성공 후 깨끗한 URL로 replace 하면서 인증 상태로 재시작됨)
    redirecting = true;
    var token = params.get('t');
    var deviceKey = getDeviceKey();

    origFetch('/api/auth/app-enter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ t: token, deviceKey: deviceKey }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var clean = location.pathname; // 토큰/파라미터 제거
        if (data && data.success) {
          location.replace(clean);
        } else {
          location.replace(LOGIN);
        }
      })
      .catch(function () { location.replace(LOGIN); });
  }
})();
