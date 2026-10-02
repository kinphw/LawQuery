// pdf.js 워커(dist/pdf.worker.min.js)의 주소는 webpack 의 publicPath 에서 나온다. 번들을 type="module" 로
// 불러 document.currentScript 가 비어 있으므로 자동 추정에 맡기지 않고 여기서 못박는다.
// ⚠️ 워커를 import 하는 모듈보다 먼저 평가돼야 한다 — entry/press.ts 의 첫 import.
declare let __webpack_public_path__: string;
__webpack_public_path__ = new URL('dist/', document.baseURI).href;

export {};
