import express from 'express';
import cors from 'cors';
import { LawHandler } from './handlers/LawHandler';
import { InterpretationHandler } from './handlers/InterpretationHandler';

const app = express();
const PORT = 3000;

// 미들웨어 설정
app.use(cors());
app.use(express.json());

// 라우터 등록
const lawHandler = new LawHandler();
const interpretationHandler = new InterpretationHandler();

app.use('/api/law', lawHandler.router);
app.use('/api/interpretation', interpretationHandler.router);

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