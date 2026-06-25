const path = require('path');

module.exports = {
  mode: 'development',
  entry: {
    law: './src/frontend/ts/entry/law.ts',
    interpretation: './src/frontend/ts/entry/interpretation.ts'
  },
  output: {
    filename: '[name].bundle.js', // dist/law.bundle.js 등으로 저장
    path: path.resolve(__dirname, 'dist'),
    clean: true
  },
  resolve: {
    extensions: ['.ts', '.js'],
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
      }
    ]
  },
  devtool: 'eval-source-map',
  // 폴링 감시 — Windows에서 외부 프로세스(에이전트/스크립트)의 파일수정은 native fs.watch가
  // 놓치는 경우가 있어 폴링으로 강제 감지(webpack serve/watch 공통 적용).
  watchOptions: {
    poll: 1000,
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
