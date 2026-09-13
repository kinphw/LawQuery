/**
 * 로컬 배포본 미리보기 서버 — 개발 중 배포본을 눈으로 확인할 때 쓴다.
 *
 *   node scripts/serve-local.js            → dist-local (http 배포본)      :5100
 *   node scripts/serve-local.js --offline  → dist-local-offline (file:// 판) :5100
 *
 * 외부 의존성 없이 Node 기본 모듈만 쓴다(배포본 확인용이라 기능은 최소로).
 * ⚠️ file:// 판은 이 서버로도 열리지만, 그것으로 "file:// 에서 된다"고 판단하면 안 된다.
 *    ES 모듈 차단 같은 file:// 고유 제약은 http 로는 절대 재현되지 않는다.
 *    → 실제 확인은 npm run local:verify (headless Chrome, file://) 또는 index.html 더블클릭.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const offline = process.argv.includes('--offline');
const DIR = path.join(ROOT, offline ? 'dist-local-offline' : 'dist-local');
const PORT = Number(process.argv.find((a) => /^\d+$/.test(a))) || 5100;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.sqlite': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

if (!fs.existsSync(DIR)) {
  console.error(`배포본이 없습니다: ${DIR}`);
  console.error(offline ? '  먼저 실행:  npm run local:zip' : '  먼저 실행:  npm run local');
  process.exit(1);
}

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const file = path.join(DIR, rel);

  // 배포본 밖으로 나가는 경로는 거부
  if (!file.startsWith(DIR)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404');
    return;
  }

  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-store', // 다시 빌드한 내용이 바로 보이도록
  });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1', () => {
  const label = offline ? 'dist-local-offline (file:// 판)' : 'dist-local (http 배포본)';
  console.log(`\n  ${label}`);
  console.log(`  http://127.0.0.1:${PORT}/index.html            법령`);
  console.log(`  http://127.0.0.1:${PORT}/interpretation.html   유권해석`);
  console.log('\n  Ctrl+C 로 종료\n');
});
