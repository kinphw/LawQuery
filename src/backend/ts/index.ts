import './config/env'; // ⚠️ 반드시 최상단 — 다른 import 보다 먼저 .env 로드(jwt.ts 등이 로드 시점에 env를 읽음)
import express from 'express';
import compression from 'compression';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { LawHandler } from './handlers/LawHandler';
import { InterpretationHandler } from './handlers/InterpretationHandler';
import { ForeignHandler } from './handlers/ForeignHandler';
import { FavoriteHandler } from './handlers/FavoriteHandler';
import { AuthHandler } from './handlers/AuthHandler';
import { BoardHandler } from './handlers/BoardHandler';

const app = express();
const PORT = 4000;

// 아파치 리버스 프록시 뒤에서 동작 → X-Forwarded-For를 신뢰해 req.ip가 실제 공인 IP를 반환.
// (sentinel 프로젝트와 동일한 방식)
// ⚠️ 보안 참고: 'true'는 모든 프록시를 신뢰하므로, 정직한 사용자는 실제 IP로 잡히지만
//   공격자가 X-Forwarded-For 를 위조하면 req.ip 를 바꿔 IP 기반 rate limit 을 우회할 수 있다.
//   완전 차단하려면 실제 프록시 홉 수로 고정(예: app.set('trust proxy', 1))해야 하는데,
//   홉 수가 틀리면 전 요청 IP가 동일해져 rate limit 이 전역 잠금을 유발할 수 있으므로,
//   운영 프록시 체인(Apache 앞 CDN 유무)을 확인한 뒤 값을 확정할 것.
app.set('trust proxy', true);

// 미들웨어 설정
// gzip 압축 — 연계표(자본시장법 등 대형 법령)는 JSON이 수 MB라 무압축 전송이 초기 로드의 큰 병목.
// 텍스트라 7MB→~1.5MB 수준으로 줄어 전송시간·체감 로딩 대폭 개선. (Apache 프록시는 Content-Encoding 통과)
app.use(compression());
// ⚠️ 보안(CORS): origin:true 는 "아무 사이트나" 쿠키 인증 요청을 보내고 응답을 읽게 한다.
//   앱은 사실 동일출처(Apache가 정적+/api 프록시)라 교차출처가 필요 없다. 알려진 출처만 허용한다.
//   (환경변수 CORS_ORIGINS 로 재정의 가능. Origin 헤더 없는 동일출처/서버간 요청은 통과.)
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS
  || 'https://codexa.kro.kr,https://codexa.test,http://localhost:3000,http://localhost:4000')
  .split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin(origin, cb) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(null, false); // 미허용 출처: CORS 헤더 미부여 → 브라우저가 교차출처 읽기 차단
  },
  credentials: true, // 쿠키 인증 위해 credentials 허용
}));
app.use(express.json());
app.use(cookieParser());

// 라우터 등록
const lawHandler = new LawHandler();
const interpretationHandler = new InterpretationHandler();
const authHandler = new AuthHandler();

// 인증 라우터 (게이트 밖)
app.use('/api', authHandler.router);

// 법령/유권해석: 게이트는 각 핸들러 내부에서 엔드포인트별로 적용
//  - 무료(optionalAuth): 단일 법령 본문·메타  /  PRO(proGuard): 연계표·벌칙·참조·별표·유권해석
app.use('/api/law', lawHandler.router);
app.use('/api/interpretation', interpretationHandler.router);
app.use('/api/foreign', new ForeignHandler().router); // 해외법령(원문·번역 2단 + 개인 메모)
app.use('/api/favorite', new FavoriteHandler().router); // 즐겨찾기(회원별 북마크, 해외·국내 공용)
app.use('/api/board', new BoardHandler().router); // 게시판(내부에서 authGuard 적용)

// 404 처리
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: '요청한 API를 찾을 수 없습니다.',
  });
});

// 서버 시작
app.listen(PORT, () => {
  console.log(`✅ 서버 실행 중: http://localhost:${PORT}`);
  console.log('✅ 서버 시작 경로:', __dirname);
});
