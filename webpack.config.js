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
        use: 'ts-loader',
        exclude: /node_modules/,
        type: 'javascript/auto' // ← 중요!
      }
    ]
  },
  devtool: 'source-map',
  devServer: {
    static: './',      // index.html, law.html이 루트에 있으니까
    port: 3000,
    open: true
  }
};
