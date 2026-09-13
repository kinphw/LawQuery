/**
 * file:// 배포본 자동 검증 — 웹서버 없이 열었을 때 정말로 화면이 뜨는지 확인한다.
 *
 *   node scripts/verify-local.js
 *
 * 왜 필요한가: http 로는 멀쩡히 돌아도 file:// 에서는 죽는 것들이 있다(ES 모듈 CORS 차단 등).
 * 실제로 `type="module"` 하나 때문에 번들이 통째로 막혀 빈 화면이 전달된 적이 있다.
 * 눈으로 열어보는 것을 대신할 수 있도록, 헤드리스 Chrome 으로 DOM 을 받아 표가 그려졌는지 센다.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'dist-local-offline');

/** 페이지별 기대치 — 표가 이만큼은 그려져야 "떴다"고 본다. */
const PAGES = [
  { file: 'index.html', label: '법령', minRows: 100, must: ['제1장', '오프라인 사본'] },
  { file: 'interpretation.html', label: '유권해석', minRows: 30, must: ['오프라인 사본'] },
];

function findChrome() {
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ];
  return candidates.find((p) => p && fs.existsSync(p)) || null;
}

function main() {
  if (!fs.existsSync(DIR)) {
    console.error(`배포본이 없습니다: ${DIR}`);
    console.error('  먼저 실행:  npm run local:zip');
    process.exit(1);
  }

  const chrome = findChrome();
  if (!chrome) {
    console.error('Chrome(또는 Edge)을 찾지 못했습니다. 수동 확인: dist-local-offline/index.html 더블클릭');
    process.exit(1);
  }

  console.log(`\n  file:// 검증 — ${path.basename(chrome)}\n`);
  let failed = false;

  for (const page of PAGES) {
    const target = path.join(DIR, page.file);
    if (!fs.existsSync(target)) {
      console.error(`  ✖ ${page.file} 없음`);
      failed = true;
      continue;
    }

    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lq-verify-'));
    let dom = '';
    try {
      dom = execFileSync(chrome, [
        '--headless=new', '--disable-gpu', '--no-sandbox',
        // 번들 로드 + sql.js 초기화 + 첫 조회까지 끝날 시간을 준다(가상 시간이라 실제로는 짧다).
        '--virtual-time-budget=30000',
        `--user-data-dir=${profile}`,
        '--dump-dom',
        `file:///${target.replace(/\\/g, '/')}`,
      ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (err) {
      console.error(`  ✖ ${page.label} — 브라우저 실행 실패: ${err.message}`);
      failed = true;
      continue;
    } finally {
      fs.rmSync(profile, { recursive: true, force: true });
    }

    const rows = (dom.match(/<tr/g) || []).length;
    const missing = page.must.filter((t) => !dom.includes(t));
    const ok = rows >= page.minRows && missing.length === 0;

    if (ok) {
      console.log(`  ✓ ${page.label.padEnd(6)} ${page.file.padEnd(22)} 표 ${String(rows).padStart(4)}행`);
    } else {
      failed = true;
      console.error(`  ✖ ${page.label.padEnd(6)} ${page.file.padEnd(22)} 표 ${rows}행 (기대 ${page.minRows}행 이상)`);
      if (missing.length) console.error(`     화면에 없는 문구: ${missing.join(', ')}`);
      if (rows === 0) {
        console.error('     → 번들이 아예 실행되지 않았을 가능성이 큽니다.');
        console.error('        file:// 에서 차단되는 요소(type="module" 등)가 HTML 에 남았는지 확인하세요.');
      }
    }
  }

  if (failed) {
    console.error('\n  file:// 검증 실패 — 이 배포본은 전달하면 안 됩니다.\n');
    process.exit(1);
  }
  console.log('\n  file:// 검증 통과 — 웹서버 없이 열어도 정상 동작합니다.\n');
}

main();
