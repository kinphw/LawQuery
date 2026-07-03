import express from 'express';
import compression from 'compression';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';
import { LawHandler } from './handlers/LawHandler';
import { InterpretationHandler } from './handlers/InterpretationHandler';
import { ForeignHandler } from './handlers/ForeignHandler';
import { FavoriteHandler } from './handlers/FavoriteHandler';
import { AuthHandler } from './handlers/AuthHandler';
import { BoardHandler } from './handlers/BoardHandler';

// .env 로드 (DbContext보다 먼저 환경변수가 필요하므로 진입점에서 1회 로드)
dotenv.config({ path: path.join(process.cwd(), '.env') });

const app = express();
const PORT = 4000;

// 아파치 리버스 프록시 뒤에서 동작 → X-Forwarded-For를 신뢰해 req.ip가 실제 공인 IP를 반환.
// (sentinel 프로젝트와 동일한 방식)
app.set('trust proxy', true);

// 미들웨어 설정
// gzip 압축 — 연계표(자본시장법 등 대형 법령)는 JSON이 수 MB라 무압축 전송이 초기 로드의 큰 병목.
// 텍스트라 7MB→~1.5MB 수준으로 줄어 전송시간·체감 로딩 대폭 개선. (Apache 프록시는 Content-Encoding 통과)
app.use(compression());
app.use(cors({ origin: true, credentials: true })); // 쿠키 인증 위해 credentials 허용
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
