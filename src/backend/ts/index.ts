const http = require('http');
const fs = require('fs');
const path = require('path');
import type { IncomingMessage, ServerResponse } from 'http';

const PORT = 3000;

const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
  if (req.url === '/api/test') {
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
    res.end(`alert("Test!");`);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 - Not Found');
});

server.listen(PORT, () => {
  console.log(`✅ 서버 실행 중: http://localhost:${PORT}`);
});
