// LawQuery Service Worker
// 목적: PWA 설치 가능 요건(fetch 핸들러) 충족 + 오프라인 시 최소한의 셸 제공.
// 원칙:
//   - 법령/해석 데이터는 항상 최신이어야 하므로 /api/* 는 절대 캐시하지 않는다(network-only).
//   - 정적 자원/페이지는 network-first: 온라인이면 항상 최신, 오프라인이면 캐시로 폴백.
// 캐시 버전을 올리면(예: v1 → v2) 이전 캐시는 activate 단계에서 정리된다.

// v4: free/pro 게이팅 — index/law를 더 이상 "보호 페이지"로 막지 않는다(비로그인 개방).
// v5: 같은 출처 자원을 항상 재검증(cache:'no-cache') — 옛 CSS·번들이 섞여 화면이 깨지던 문제.
const CACHE_VERSION = 'lawquery-v5';

// 설치 시 미리 받아둘 자원: 로그인 화면 + 공용 정적 자원만.
// 페이지(index/law)는 precache하지 않고 network-first로 항상 최신 셸을 받는다.
// 상대경로로 작성해 .test / .kro.kr 양쪽 도메인에서 동일하게 동작.
const PRECACHE_URLS = [
  './login.html',
  './auth-gate.js',
  './manifest.json',
  './assets/css/style.css',
  './assets/vendor/bootstrap.min.css',
  './assets/vendor/bootstrap.bundle.min.js',
  './assets/icons/icon-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      // 일부 자원이 실패해도 설치가 통째로 깨지지 않도록 개별 처리
      Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)))
    )
  );
  // 새 SW를 즉시 활성화 대기로
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // GET 이외(POST 등)는 그대로 통과
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // API 요청은 캐시하지 않고 항상 네트워크 (데이터 최신성 보장)
  if (url.pathname.startsWith('/api/')) {
    return; // 기본 네트워크 처리에 위임
  }

  // 정적 자원/페이지: network-first → 실패 시 캐시 폴백.
  // (index/law도 이제 비로그인 개방이므로 일반 자원과 동일하게 취급)
  // ⚠️ 같은 출처 자원은 cache:'no-cache' 로 받는다(서버에 매번 "바뀌었나" 확인, 안 바뀌었으면 304 라 가볍다).
  //   그냥 fetch(request) 는 브라우저 HTTP 캐시를 먼저 보는데, Apache 가 만료 헤더를 주지 않아 브라우저가
  //   "오래 안 바뀐 파일"을 며칠씩 확인 없이 재사용한다. 그러면 새로 빌드한 style.css·번들 중 일부만 옛것이 섞여
  //   화면이 깨진다(2026-10-02 기관 보도자료: 새 번들 + 옛 CSS). 강제 새로고침은 SW 를 건너뛰어 그때만 멀쩡했다.
  const sameOrigin = url.origin === self.location.origin;
  event.respondWith(
    fetch(request, sameOrigin ? { cache: 'no-cache' } : undefined)
      .then((response) => {
        if (response && response.status === 200 && url.origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => cached || caches.match('./login.html'))
      )
  );
});
