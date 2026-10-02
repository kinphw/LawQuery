const path = require('path');

module.exports = {
  mode: 'development',
  entry: {
    law: './src/frontend/ts/entry/law.ts',
    interpretation: './src/frontend/ts/entry/interpretation.ts',
    foreign: './src/frontend/ts/entry/foreign.ts',
    'foreign-transition': './src/frontend/ts/entry/foreignTransition.ts',
    press: './src/frontend/ts/entry/press.ts'
  },
  output: {
    filename: '[name].bundle.js', // dist/law.bundle.js 등으로 저장
    path: path.resolve(__dirname, 'dist'),
    clean: true
  },
  resolve: {
    extensions: ['.ts', '.js'],
    // pdf.js 는 압축본을 쓴다 — 비압축본(pdf.mjs)은 안에 `__webpack_exports__` 변수가 있어
    // eval 계열 devtool 로 묶으면 이름이 겹쳐 로드 시점에 죽는다("defineProperty called on non-object").
    alias: { 'pdfjs-dist$': 'pdfjs-dist/build/pdf.min.mjs' },
    fullySpecified: false  // 핵심 옵션!
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: {
          loader: 'ts-loader',
          options: { transpileOnly: true }
        },
        exclude: /node_modules/,
        type: 'javascript/auto' // ← 중요!
      },
      {
        // pdf.js 워커(기관 보도자료 원문 보기) — 번들에 넣지 않고 dist/pdf.worker.min.js 로 내보낸다.
        // 확장자를 .js 로 바꾸는 이유: 모듈 워커는 MIME 이 자바스크립트가 아니면 안 뜨는데 .mjs 는 서버 설정을 탄다.
        test: /pdf\.worker\.min\.mjs$/,
        type: 'asset/resource',
        generator: { filename: 'pdf.worker.min.js' }
      }
    ]
  },
  devtool: 'eval-source-map',
  // 네이티브 파일 감시(OS fs 이벤트) 사용 — 인위적 폴링(poll)은 넣지 않는다.
  // 폴링은 idle 상태에서도 CPU를 상시 점유하므로 제거하고, webpack이 의도한 native watch를 그대로 사용.
  watchOptions: {
    ignored: /node_modules/
  },
  // devServer: {
  //   static: './',      // index.html, law.html이 루트에 있으니까
  //   port: 4000,
  //   open: true
  // }
  devServer: {
    static: './',
    port: 3000,
    open: false,
    proxy: [
      {
        context: ['/api'],
        target: 'http://localhost:4000',
        changeOrigin: true
      }
    ]
  },
  cache: {
    type: 'filesystem'
  }
};
