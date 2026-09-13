/**
 * 로컬 배포본을 지금 이 자리에서 열어 본다 — 압축을 풀 필요 없이 dist-local-offline 을 그대로.
 *
 *   node scripts/open-local.js                  → 법령 화면 (file://)
 *   node scripts/open-local.js interpretation   → 유권해석 화면
 *
 * 받는 사람이 index.html 을 더블클릭하는 것과 같은 경로(file://)로 뜬다.
 * 실제 전달물과 다른 점은 zip 으로 묶였는지 여부뿐이다.
 */
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'dist-local-offline');

const arg = process.argv[2] || 'index';
const page = arg.endsWith('.html') ? arg : `${arg}.html`;
const target = path.join(DIR, page);

if (!fs.existsSync(target)) {
  console.error(`열 파일이 없습니다: ${target}`);
  console.error('  먼저 실행:  npm run local:zip');
  process.exit(1);
}

console.log(`\n  여는 중: ${page}  (file:// — 전달본과 같은 방식)`);
console.log(`  ${target}\n`);

// 기본 브라우저로. start 는 cmd 내장 명령이라 shell 을 거쳐야 한다.
execFile('cmd', ['/c', 'start', '', target], (err) => {
  if (err) {
    console.error('  자동 실행에 실패했습니다. 아래 파일을 직접 더블클릭하세요:');
    console.error(`  ${target}`);
  }
});
