// LawQuery Service Worker
// 목적: PWA 설치 가능 요건(fetch 핸들러) 충족 + 오프라인 시 최소한의 셸 제공.
// 원칙:
//   - 법령/해석 데이터는 항상 최신이어야 하므로 /api/* 는 절대 캐시하지 않는다(network-only).
//   - 정적 자원/페이지는 network-first: 온라인이면 항상 최신, 오프라인이면 캐시로 폴백.
// 캐시 버전을 올리면(예: v1 → v2) 이전 캐시는 activate 단계에서 정리된다.

const CACHE_VERSION = 'lawquery-v2';

// 설치 시 미리 받아둘 핵심 정적 자원(앱 셸).
// 상대경로로 작성해 .test / .kro.kr 양쪽 도메인에서 동일하게 동작하게 한다.
const PRECACHE_URLS = [
  './',
  './index.html',
  './law.html',
  './login.html',
  './auth-gate.js',
  './manifest.json',
  './assets/css/style.css',
  './assets/vendor/bootstrap.min.css',
  './assets/vendor/bootstrap.bundle.min.js',
  './dist/interpretation.bundle.js',
  './dist/law.bundle.js',
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

  // 그 외 정적 자원/페이지: network-first → 실패 시 캐시 폴백
  event.respondWith(
    fetch(request)
      .then((response) => {
        // 정상 응답이면 캐시에 갱신(동일 출처만)
        if (response && response.status === 200 && url.origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => cached || caches.match('./index.html'))
      )
  );
});
