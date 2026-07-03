import { ForeignController } from '../foreign/controllers/ForeignController';

console.log('Foreign Law Entry Point Loaded');

// 뷰어(?code=)는 브라우저의 '픽셀 y' 스크롤 복원을 끈다(모듈 로드 즉시 — 복원 시도 전).
// 윈도잉 추정 높이 탓에 픽셀 복원은 리로드 전과 다른 조에 떨어진다 → 렌더 후
// ForeignScrollAnchor가 '조 앵커' 기준으로 정확히 복원한다. 카탈로그는 기본 복원 유지.
if (new URLSearchParams(location.search).get('code') && 'scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

document.addEventListener('DOMContentLoaded', async () => {
  const ctrl = new ForeignController();
  await ctrl.initialize();
});
