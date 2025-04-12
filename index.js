const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const root = path.join(__dirname);

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

const server = http.createServer((req, res) => {
  if (req.url === '/api/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ message: '✅ Node.js API 정상 작동!!' }));
    return;
  }

  const reqPath = req.url === '/' ? '/index.html' : decodeURIComponent(req.url);
  const filePath = path.join(root, reqPath);
  const ext = path.extname(filePath);
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 - 파일을 찾을 수 없습니다');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, () => {
  console.log(`✅ Node.js 서버 실행 중: http://localhost:${PORT}`);
});
