// webpack.config.js 의 asset/resource 규칙이 워커 파일을 dist/pdf.worker.min.js 로 내보내고 그 주소를 돌려준다.
declare module 'pdfjs-dist/build/pdf.worker.min.mjs' {
  const url: string;
  export default url;
}
