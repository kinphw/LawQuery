import http from 'http';
import { apiHandler } from './handlers/apiHandler';
import type { IncomingMessage, ServerResponse } from 'http';

const PORT = 3000;

const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
  apiHandler(req, res);
});

server.listen(PORT, () => {
  console.log(`✅ 서버 실행 중: http://localhost:${PORT}`);
  console.log('✅ 서버 시작 경로:', __dirname);
});
