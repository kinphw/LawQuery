const path = require('path');

module.exports = {
  mode: 'development',
  entry: {
    law: './src/frontend/ts/entry/law.ts',
    interpretation: './src/frontend/ts/entry/interpretation.ts',
    foreign: './src/frontend/ts/entry/foreign.ts',
    'foreign-transition': './src/frontend/ts/entry/foreignTransition.ts'
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
