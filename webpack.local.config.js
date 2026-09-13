/**
 * 로컬(오프라인) 배포본 번들 설정.
 *
 * 호스팅판(webpack.config.js)과 프론트 소스를 100% 공유하고, 딱 두 모듈만 갈아끼운다.
 *   common/DbContext          → src/local/SqlJsDbContext   (MySQL  → sql.js/SQLite)
 *   auth/middleware/authGuard → src/local/authStub          (게이팅 → 전량 개방)
 *
 * 이 치환 덕분에 백엔드 Model/Controller 와 프론트 코드를 한 글자도 고치지 않는다.
 * (법령·해석 Model 의 Node 런타임 의존은 process.env.AUTH_DB 한 곳뿐이라 DefinePlugin 으로 해결)
 */
const path = require('path');
const webpack = require('webpack');

module.exports = {
  mode: 'production',
  entry: {
    law: './src/local/entry/law.local.ts',
    interpretation: './src/local/entry/interpretation.local.ts',
  },
  output: {
    // HTML 이 dist/law.bundle.js 를 참조하므로 배포본 안에서도 같은 경로를 유지한다.
    filename: 'dist/[name].bundle.js',
    path: path.resolve(__dirname, 'dist-local'),
    clean: false, // db/ 등 다른 산출물을 지우지 않는다
  },
  resolve: {
    extensions: ['.ts', '.js'],
    fullySpecified: false,
    // 브라우저에는 Node 코어 모듈이 없다. sql.js 가 참조하더라도 폴리필하지 않고 잘라낸다.
    fallback: { fs: false, path: false, crypto: false },
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true, // 백엔드 타입(express·mysql2)은 값이 아니라 타입일 뿐이라 그대로 지워진다
            compilerOptions: { noEmit: false },
          },
        },
        exclude: /node_modules/,
        type: 'javascript/auto',
      },
      {
        // sql.js 가 내부에서 .wasm 을 참조할 때 webpack 이 끼어들지 않게 둔다(locateFile 로 직접 지정).
        test: /\.wasm$/,
        type: 'asset/resource',
        generator: { filename: '[name][ext]' },
      },
    ],
  },
  plugins: [
    new webpack.NormalModuleReplacementPlugin(
      /common[\\/]DbContext$/,
      path.resolve(__dirname, 'src/local/SqlJsDbContext.ts'),
    ),
    new webpack.NormalModuleReplacementPlugin(
      /middleware[\\/]authGuard$/,
      path.resolve(__dirname, 'src/local/authStub.ts'),
    ),
    // ⓘ 정보 모달 — 폐쇄망으로 나가는 사본에 서비스 주소·저장소 링크가 실리면 안 된다.
    // 외부를 가리키는 문구는 이 모듈 하나에 모여 있으므로 통째로 갈아끼운다.
    // ⚠️ 정규식은 import 문에 적힌 "요청 문자열" 과 맞춘다. Header.ts 는 같은 폴더라
    //    './appInfo' 로 부르므로 'components/appInfo' 로는 잡히지 않는다.
    new webpack.NormalModuleReplacementPlugin(
      /(^|[\\/])appInfo$/,
      path.resolve(__dirname, 'src/local/appInfoStub.ts'),
    ),
    // 로컬판에서 제공하지 않는 기능 — 'HTML 저장'(사본 자체가 이미 로컬 파일)과 '개정비교'.
    // 스텁이 해당 버튼을 DOM 에서 걷어내므로 HTML 은 호스팅판 원본을 그대로 쓴다.
    new webpack.NormalModuleReplacementPlugin(
      /(^|[\\/])(LawExportEventManager|LawRevisionEventManager)$/,
      path.resolve(__dirname, 'src/local/lawFeatureStub.ts'),
    ),
    // 브라우저에는 process 가 없다. 법령 Model 이 읽는 AUTH_DB 는 폴백('ldb_auth')이 쓰이게 둔다.
    new webpack.DefinePlugin({
      'process.env': '({})',
    }),
  ],
  performance: { hints: false },
  devtool: false,
};
