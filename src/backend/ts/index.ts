import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';
import { LawHandler } from './handlers/LawHandler';
import { InterpretationHandler } from './handlers/InterpretationHandler';
import { AuthHandler } from './handlers/AuthHandler';
import { authGuard } from './auth/middleware/authGuard';

// .env 로드 (DbContext보다 먼저 환경변수가 필요하므로 진입점에서 1회 로드)
dotenv.config({ path: path.join(process.cwd(), '.env') });

const app = express();
const PORT = 4000;

// 아파치 리버스 프록시 뒤에서 동작 → X-Forwarded-For를 신뢰해 req.ip가 실제 공인 IP를 반환.
// (sentinel 프로젝트와 동일한 방식)
app.set('trust proxy', true);

// 미들웨어 설정
app.use(cors({ origin: true, credentials: true })); // 쿠키 인증 위해 credentials 허용
app.use(express.json());
app.use(cookieParser());

// 라우터 등록
const lawHandler = new LawHandler();
const interpretationHandler = new InterpretationHandler();
const authHandler = new AuthHandler();

// 인증 라우터 (게이트 밖)
app.use('/api', authHandler.router);

// 보호 라우터 (로그인 + 승인 필요)
app.use('/api/law', authGuard, lawHandler.router);
app.use('/api/interpretation', authGuard, interpretationHandler.router);

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
