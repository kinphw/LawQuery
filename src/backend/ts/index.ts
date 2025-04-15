const http = require('http');
const fs = require('fs');
const path = require('path');
import type { IncomingMessage, ServerResponse } from 'http';

const PORT = 3000;

const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
  if (req.url === '/api/test') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    const response = { message: "크헤헤!" }; // JSON 객체 생성
    res.end(JSON.stringify(response)); // JSON 문자열로 변환 후 응답
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 - Not Found');
});

server.listen(PORT, () => {
  console.log(`✅ 서버 실행 중: http://localhost:${PORT}`);
  console.log('✅ 서버 시작 경로:', __dirname);
});
