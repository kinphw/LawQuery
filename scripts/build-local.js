/**
 * 로컬(오프라인) 배포본 패키징 — 번들 외의 정적 자산을 dist-local/ 로 모은다.
 *
 * 실행 순서(package.json 의 build:local):
 *   1) webpack --config webpack.local.config.js   → dist-local/dist/*.bundle.js
 *   2) node scripts/build-local.js                → HTML·assets·wasm·README 배치   ← 이 파일
 *   (데이터는 python scripts/export-local.py 가 dist-local/db/ 에 미리 넣어둔다)
 *
 * 원칙: HTML 은 원본을 그대로 복사한다. 로컬판 전용 동작은 같은 파일명으로 덮어쓰는
 *       auth-gate.js(스텁) 한 장으로 끝낸다 → 호스팅판 HTML 과 갈라지지 않는다.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'dist-local');

/** 로컬판에 포함할 페이지. 회원·게시판·관리자·해외법령 페이지는 제외한다. */
const PAGES = ['index.html', 'interpretation.html'];

/** 통째로 복사할 자산 디렉토리 (assets/img 는 스토어용 스크린샷이라 제외). */
const ASSET_DIRS = ['assets/css', 'assets/vendor', 'assets/icons'];

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return 0;
  fs.mkdirSync(dest, { recursive: true });
  let count = 0;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) count += copyDir(from, to);
    else {
      fs.copyFileSync(from, to);
      count++;
    }
  }
  return count;
}

function dirSize(dir) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    total += entry.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return total;
}

const mb = (bytes) => (bytes / 1048576).toFixed(2) + ' MB';

/**
 * 정보유출 검사 — 배포본은 폐쇄망으로 "전달"되는 사본이다.
 * 서비스 주소·자격증명·개인정보가 한 글자라도 섞이면 빌드를 실패시킨다.
 *
 * 수동 확인은 언젠가 빠지므로 파이프라인에 못박아 둔다.
 * (실제로 2026-08-26 첫 빌드에서 ⓘ 정보 모달의 운영 도메인·저장소 링크가 새어 나갔다)
 */
const FORBIDDEN = [
  // 서비스가 어디서 도는지 추정할 수 있는 것 — 데이터에 우연히 들어갈 리 없는 고유 문자열
  /codexa/i, /kro\.kr/i, /pnest/i,
  // 운영자·저장소 식별
  /kinphw/i, /sncmlife/i, /github\.com\/[A-Za-z0-9-]+\/LawQuery/i,
  // 자격증명
  /MYSQL_(PASSWORD|USER|HOST)/i, /JWT_SECRET/i, /APP_TOKEN/i, /lq-app-\d/i,
  /ldbuser/i, /GMAIL_APP_PASSWORD/i, /password_hash/i,
  // 빌드 PC 경로
  /C:[\\/]+projects/i,
];

/**
 * 머리 부분만 확인하는 파일들.
 *  - offline-*.js 는 base64 라 안을 볼 수 없지만, 같은 내용의 .sqlite 를 전수 검사하므로 등가다.
 *  - 폰트·이미지·wasm 은 우리가 만든 것이 아니다.
 * .sqlite 는 전수 검사한다 — 회원 테이블이 실수로 딸려 들어가는 사고를 잡기 위해서다.
 */
const HEAD_ONLY = /(offline-.*\.js|\.wasm|\.woff2?|\.png|\.jpg|\.ico)$/i;

function auditLeaks(dir, label) {
  const found = [];

  const walk = (cur) => {
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const p = path.join(cur, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '_offline') continue;
        walk(p);
        continue;
      }
      let text;
      if (HEAD_ONLY.test(entry.name)) {
        // 바이너리·base64: 앞부분(헤더·주석·스탬프)만 확인. 본문 데이터는 .sqlite 검사로 커버.
        const fd = fs.openSync(p, 'r');
        const buf = Buffer.alloc(Math.min(64 * 1024, fs.statSync(p).size));
        fs.readSync(fd, buf, 0, buf.length, 0);
        fs.closeSync(fd);
        text = buf.toString('latin1');
      } else {
        text = fs.readFileSync(p, 'latin1');
      }
      for (const re of FORBIDDEN) {
        const m = text.match(re);
        if (m) found.push({ file: path.relative(dir, p), hit: m[0], re: String(re) });
      }
    }
  };
  walk(dir);

  if (found.length) {
    console.error(`\n  ✖ 정보유출 검사 실패 — ${label}`);
    for (const f of found) console.error(`     ${f.file}  →  "${f.hit}"  (${f.re})`);
    console.error('\n  배포본에 외부 정보가 섞였습니다. 해당 문자열을 로컬 빌드에서 제외한 뒤 다시 빌드하세요.');
    console.error('  (링크·주소는 src/frontend/ts/common/components/appInfo.ts 한 곳에만 두고,');
    console.error('   로컬판은 src/local/appInfoStub.ts 로 치환됩니다 — docs/LOCAL.md 참조)');
    process.exitCode = 1;
    return false;
  }
  console.log(`  ✓ 정보유출 검사 통과 — ${label} (금지 패턴 ${FORBIDDEN.length}종)`);
  return true;
}

/** 페이지·스타일·번들에서 실제로 참조하는 assets/img 경로만 뽑는다. */
function scanReferencedImages() {
  const haystack = [
    ...PAGES.map((p) => path.join(ROOT, p)),
    path.join(ROOT, 'assets/css/style.css'),
    path.join(OUT, 'dist/law.bundle.js'),
    path.join(OUT, 'dist/interpretation.bundle.js'),
  ];
  const found = new Set();
  for (const file of haystack) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(/assets\/img\/[A-Za-z0-9._/-]+/g)) found.add(m[0]);
  }
  return [...found];
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });

  // 0) 묵은 산출물 제거.
  //    복사만 하고 지우지 않으면 원본에서 삭제한 파일이 배포본에 계속 남는다
  //    (실제로 걷어낸 sql-wasm.js 등 1.5MB 유물이 zip 에 그대로 실려 나갔다).
  //
  //    ⚠️ 보존 대상을 반드시 지킬 것:
  //      db/       추출 데이터 (export-local.py 산출물)
  //      _offline/ base64 중간 캐시
  //      dist/     ★ webpack 이 바로 앞 단계에서 만든 번들 — 지우면 앱이 없는 빈 껍데기가 나간다
  const KEEP = new Set(['db', '_offline', 'dist']);
  for (const entry of fs.readdirSync(OUT, { withFileTypes: true })) {
    if (KEEP.has(entry.name)) continue;
    fs.rmSync(path.join(OUT, entry.name), { recursive: true, force: true });
  }

  // 1) 페이지
  for (const page of PAGES) {
    const src = path.join(ROOT, page);
    if (!fs.existsSync(src)) {
      console.warn(`  ! ${page} 없음 — 건너뜀`);
      continue;
    }
    fs.copyFileSync(src, path.join(OUT, page));
    console.log(`  page     ${page}`);
  }

  // 2) 인증 게이트를 로컬 스텁으로 "덮어쓴다" (HTML 무수정의 핵심)
  fs.copyFileSync(path.join(ROOT, 'src/local/auth-gate.local.js'), path.join(OUT, 'auth-gate.js'));
  console.log('  stub     auth-gate.js  (로컬 전용 — 항상 전체 기능)');

  // 3) 정적 자산
  for (const dir of ASSET_DIRS) {
    const n = copyDir(path.join(ROOT, dir), path.join(OUT, dir));
    console.log(`  assets   ${dir}  (${n}개)`);
  }

  // 이미지는 통째로 복사하지 않는다(assets/img 7.5MB 대부분이 스토어용 스크린샷·원본).
  // 페이지·CSS·번들이 실제로 참조하는 것만 골라 넣는다 → 나중에 이미지가 늘어도 자동으로 따라온다.
  for (const rel of scanReferencedImages()) {
    const src = path.join(ROOT, rel);
    if (!fs.existsSync(src)) {
      console.warn(`  ! 참조된 이미지 없음: ${rel}`);
      continue;
    }
    const dest = path.join(OUT, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    console.log(`  image    ${rel}  (${mb(fs.statSync(src).size)})`);
  }

  // PWA 매니페스트가 있으면 함께 (없어도 무해)
  for (const extra of ['manifest.json', 'favicon.ico']) {
    const src = path.join(ROOT, extra);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(OUT, extra));
  }

  // 4) sql.js WASM — SqlJsDbContext 의 locateFile 이 배포본 루트에서 찾는다.
  //    webpack 이 고르는 sql.js 빌드에 따라 요구하는 파일명이 다르므로(브라우저 빌드는
  //    sql-wasm-browser.wasm) 둘 다 둔다. 합쳐도 1.3MB 남짓이다.
  let wasmCopied = 0;
  for (const name of ['sql-wasm-browser.wasm', 'sql-wasm.wasm']) {
    const src = path.join(ROOT, 'node_modules/sql.js/dist', name);
    if (!fs.existsSync(src)) continue;
    fs.copyFileSync(src, path.join(OUT, name));
    console.log(`  engine   ${name}  (${mb(fs.statSync(src).size)})`);
    wasmCopied++;
  }
  if (!wasmCopied) console.warn('  ! sql.js WASM 을 찾지 못했습니다 (npm i sql.js)');

  // 서비스워커 — index.html 이 등록을 시도하므로 없으면 콘솔 오류가 난다.
  // 오프라인 사본은 이미 전부 로컬에 있어 캐싱이 불필요하니, 등록을 해제하는 빈 워커를 둔다.
  fs.writeFileSync(path.join(OUT, 'service-worker.js'), SW_STUB, 'utf8');
  console.log('  stub     service-worker.js  (오프라인 사본 — 캐싱 불필요)');

  // 5) 사용 안내
  fs.writeFileSync(path.join(OUT, '읽어보세요.txt'), README, 'utf8');

  // 6) 요약
  const dbBytes = dirSize(path.join(OUT, 'db'));
  // _offline 은 file:// 배포본을 만들기 위한 중간 캐시 — 배포 대상이 아니므로 합계에서 뺀다.
  const totalBytes = dirSize(OUT) - dirSize(path.join(OUT, '_offline'));
  console.log('\n  ── 배포본 구성 (http — 서버·공유폴더용) ──');
  console.log(`  데이터(db/)   ${mb(dbBytes)}`);
  console.log(`  나머지        ${mb(totalBytes - dbBytes)}`);
  console.log(`  합계          ${mb(totalBytes)}`);
  if (dbBytes === 0) {
    console.warn('\n  ! db/ 가 비어 있습니다. 먼저 실행:  python scripts/export-local.py');
  }

  auditLeaks(OUT, 'dist-local (호스팅용)');

  if (process.argv.includes('--offline')) buildOfflineVariant();
}

/**
 * file:// 배포본 — 웹서버 없이 index.html 을 더블클릭해 여는 형태.
 *
 * 브라우저는 file:// 에서 fetch 를 막으므로 .sqlite 와 .wasm 을 base64 로 <script> 에 실어 나른다
 * (2025-03 최초 버전이 쓰던 기법). 그 대가로 1.33배 커지고, 페이지를 열 때 통째로 읽는다.
 * 그래서 http 배포본과 폴더를 나눈다 — 서버가 있다면 그쪽이 더 빠르고 가볍다.
 */
function buildOfflineVariant() {
  const OFFLINE = path.join(ROOT, 'dist-local-offline');
  const lawData = path.join(OUT, '_offline/offline-law.js');
  const interpData = path.join(OUT, '_offline/offline-interp.js');

  if (!fs.existsSync(lawData)) {
    console.warn('\n  ! offline 데이터가 없습니다. 먼저 실행:  python scripts/export-local.py --offline');
    return;
  }

  console.log('\n  ── file:// 배포본 생성 ──');
  fs.rmSync(OFFLINE, { recursive: true, force: true });
  fs.mkdirSync(OFFLINE, { recursive: true });

  // .sqlite 원본은 뺀다(base64 사본이 이미 들어가므로 중복).
  for (const entry of fs.readdirSync(OUT, { withFileTypes: true })) {
    if (entry.name === 'db' || entry.name === '_offline') continue;
    const from = path.join(OUT, entry.name);
    const to = path.join(OFFLINE, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
  fs.mkdirSync(path.join(OFFLINE, 'db'), { recursive: true });
  fs.copyFileSync(lawData, path.join(OFFLINE, 'db/offline-law.js'));
  if (fs.existsSync(interpData)) fs.copyFileSync(interpData, path.join(OFFLINE, 'db/offline-interp.js'));
  // 기준일은 데이터 스크립트에 심어 두지만, 이 폴더를 http 로 서빙할 경우를 위해 매니페스트도 함께 둔다.
  const mf = path.join(OUT, 'db/manifest.json');
  if (fs.existsSync(mf)) fs.copyFileSync(mf, path.join(OFFLINE, 'db/manifest.json'));

  // WASM 도 fetch 할 수 없으므로 base64 로. SqlJsDbContext 가 window.LQ_WASM_B64 를 본다.
  const wasmSrc = path.join(ROOT, 'node_modules/sql.js/dist/sql-wasm-browser.wasm');
  const wasmB64 = fs.readFileSync(wasmSrc).toString('base64');
  fs.writeFileSync(path.join(OFFLINE, 'sql-wasm-b64.js'),
    `window.LQ_WASM_B64=${JSON.stringify(wasmB64)};\n`, 'utf8');

  // HTML 에 데이터 스크립트를 끼워 넣는다(auth-gate 보다 앞 = 번들보다 앞).
  const inject = {
    'index.html': ['sql-wasm-b64.js', 'db/offline-law.js'],
    'interpretation.html': ['sql-wasm-b64.js', 'db/offline-interp.js'],
  };
  for (const [page, scripts] of Object.entries(inject)) {
    const file = path.join(OFFLINE, page);
    if (!fs.existsSync(file)) continue;
    let html = fs.readFileSync(file, 'utf8');
    const tags = scripts.map((s) => `<script src="${s}"></script>`).join('\n  ');
    html = html.replace(
      /<script src="auth-gate\.js"><\/script>/,
      `${tags}\n  <script src="auth-gate.js"></script>`,
    );

    // ★ file:// 에서 브라우저가 막는 것들을 걷어낸다. http 배포본은 그대로 두고 여기서만 손댄다.
    //
    // 1) type="module" — ES 모듈은 file:// 에서 CORS 정책에 걸려 아예 로드되지 않는다
    //    ("blocked by CORS policy ... only supported for protocol schemes: http, https").
    //    webpack 번들은 클래식 스크립트로 나오므로 이 속성은 없어도 똑같이 동작한다.
    // 2) <link rel="manifest"> — PWA 매니페스트도 같은 이유로 차단되어 콘솔만 더럽힌다.
    //    오프라인 사본에 설치형 PWA 는 의미도 없다.
    const before = html;
    html = html.replace(/\s+type="module"/g, '');
    html = html.replace(/[ \t]*<link[^>]*rel="manifest"[^>]*>\s*\n?/gi, '');
    const stripped = before !== html;

    fs.writeFileSync(file, html, 'utf8');
    console.log(`  inject   ${page}  ← ${scripts.join(', ')}`
      + (stripped ? '  (+ file:// 차단요소 제거)' : ''));
  }

  fs.writeFileSync(path.join(OFFLINE, '읽어보세요.txt'),
    README.replace('방법 1. 사내 서버·공유폴더에 올려서 쓰기 (권장)',
      '방법 1. 사내 서버·공유폴더에 올려서 쓰기 (권장 — 단, 그 용도로는 http 배포본이 더 빠릅니다)'),
    'utf8');

  console.log(`  합계          ${mb(dirSize(OFFLINE))}   → dist-local-offline/`);

  // 전달물이므로 여기서 막히면 zip 을 만들지 않는다.
  if (!verifyOfflineHtml(OFFLINE)) return;
  if (!auditLeaks(OFFLINE, 'dist-local-offline (전달용)')) return;

  if (process.argv.includes('--zip')) zipOffline(OFFLINE);

}

/**
 * 단독실행 배포본을 zip 한 장으로 묶는다 — 이것만 "전달"되는 물건이다.
 * (서버용 dist-local/ 은 여기서 직접 호스팅하므로 압축할 이유가 없다.)
 *
 * Windows 기본 구성만 쓴다(별도 패키지 설치 없음). 다만 `Compress-Archive` 는 항목 경로를
 * 백슬래시로 적어 넣는데, zip 규격은 슬래시를 요구한다 — 그대로 두면 7-Zip·macOS·Linux 에서
 * 폴더 구조가 무너진 채 풀린다. 폐쇄망에 건네는 물건이라 여기서 어떤 도구로 풀지 알 수 없으므로,
 * ZipArchive 로 항목을 직접 넣으며 경로를 슬래시로 정규화한다.
 */
function zipOffline(offlineDir) {
  const { execFileSync } = require('child_process');
  const outDir = path.join(ROOT, 'release');
  fs.mkdirSync(outDir, { recursive: true });

  // 파일명 규칙:  LawQuery-Portable-<YYYYMMDD>.zip   (같은 날 재배포는 -2, -3)
  //
  //  · "Portable" — 설치 없이 풀어서 바로 쓰고 USB 로 들고 다니는 성격을 그대로 말한다.
  //  · 별도 버전관리가 없으니 **데이터를 뽑은 날짜가 곧 판(版)** 이다 → 날짜를 버전처럼 쓴다.
  //  · 같은 날 다시 뽑으면 -2, -3 이 붙어 이전 사본을 절대 덮어쓰지 않는다.
  //  · 파일명에 한글을 쓰지 않는다 — 폐쇄망으로 건네는 경로(메일 게이트웨이·USB·구형 압축도구)에서
  //    한글 이름이 깨지거나 거부되는 일이 흔하다. 안내문(읽어보세요.txt)은 압축 안에 있으니 무관.
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const version = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}`;

  let zipPath = path.join(outDir, `LawQuery-Portable-${version}.zip`);
  for (let n = 2; fs.existsSync(zipPath); n++) {
    zipPath = path.join(outDir, `LawQuery-Portable-${version}-${n}.zip`);
  }

  console.log('\n  ── 배포용 zip 생성 ──');
  const ps = [
    "Add-Type -AssemblyName System.IO.Compression",
    "Add-Type -AssemblyName System.IO.Compression.FileSystem",
    `$src = '${offlineDir}'`,
    `$zip = [System.IO.Compression.ZipFile]::Open('${zipPath}', 'Create')`,
    "try {",
    "  Get-ChildItem -LiteralPath $src -Recurse -File | ForEach-Object {",
    // zip 규격 경로: 항상 슬래시
    "    $rel = $_.FullName.Substring($src.Length + 1).Replace('\\', '/')",
    "    [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $rel, 'Optimal')",
    "  }",
    "} finally { $zip.Dispose() }",
  ].join('; ');

  try {
    execFileSync('powershell', [
      '-NoProfile', '-NonInteractive', '-Command', ps,
    ], { stdio: 'pipe' });
  } catch (err) {
    console.error('  ! zip 생성 실패:', err.message);
    return;
  }
  console.log(`  ${path.basename(zipPath)}   ${mb(fs.statSync(zipPath).size)}`);

  if (!verifyZip(zipPath)) {
    // 온전하지 않은 사본은 남겨두지 않는다 — 실수로 전달되는 쪽이 훨씬 나쁘다.
    fs.rmSync(zipPath, { force: true });
    console.error('  → 불완전한 zip 을 삭제했습니다.');
    process.exitCode = 1;
    return;
  }
  console.log(`  → ${outDir}`);
}

/**
 * file:// 배포본 HTML 검사 — 웹서버 없이 열었을 때 실제로 뜨는지를 좌우하는 조건들.
 *
 * http 로는 멀쩡히 돌아도 file:// 에서는 죽는 것들이 있다. 실제로 `type="module"` 하나 때문에
 * 번들이 통째로 차단되어 빈 화면이 나갔다("blocked by CORS policy" — ES 모듈은 file:// 미지원).
 * http 검증만으로는 절대 잡히지 않으므로 여기서 정적으로 못박는다.
 */
function verifyOfflineHtml(offlineDir) {
  const RULES = [
    { name: 'ES 모듈 속성이 남아 있음 (file:// 에서 번들이 차단된다)', bad: /type=["']module["']/ },
    { name: 'PWA 매니페스트 링크가 남아 있음 (file:// 에서 차단)', bad: /<link[^>]*rel=["']manifest["']/i },
  ];
  const NEEDED = {
    'index.html': ['db/offline-law.js', 'sql-wasm-b64.js', 'auth-gate.js', 'dist/law.bundle.js'],
    'interpretation.html': ['db/offline-interp.js', 'sql-wasm-b64.js', 'auth-gate.js', 'dist/interpretation.bundle.js'],
  };

  const problems = [];
  for (const [page, needed] of Object.entries(NEEDED)) {
    const file = path.join(offlineDir, page);
    if (!fs.existsSync(file)) {
      problems.push(`${page}: 파일이 없음`);
      continue;
    }
    const html = fs.readFileSync(file, 'utf8');
    for (const rule of RULES) {
      if (rule.bad.test(html)) problems.push(`${page}: ${rule.name}`);
    }
    for (const src of needed) {
      if (!html.includes(src)) problems.push(`${page}: '${src}' 참조가 없음`);
    }
    // 데이터·엔진은 반드시 번들보다 먼저 실행되어야 한다.
    const dataAt = html.indexOf('sql-wasm-b64.js');
    const bundleAt = html.indexOf('.bundle.js');
    if (dataAt >= 0 && bundleAt >= 0 && dataAt > bundleAt) {
      problems.push(`${page}: 데이터 스크립트가 번들보다 뒤에 있음`);
    }
  }

  if (problems.length) {
    console.error('\n  ✖ file:// 배포본 검사 실패');
    for (const p of problems) console.error(`     ${p}`);
    process.exitCode = 1;
    return false;
  }
  console.log('  ✓ file:// 배포본 검사 통과 (ES모듈·매니페스트 제거, 로드 순서 OK)');
  return true;
}

/**
 * zip 완결성 검사 — 압축이 됐다고 쓸 수 있는 물건은 아니다.
 *
 * 실제로 2026-08-26, 묵은 파일 정리가 webpack 번들까지 지워버려 앱이 없는 zip 이 만들어졌다.
 * 용량도 그럴듯했고 유출 검사도 통과했지만 열면 빈 화면이다. 그래서 "무엇이 들어 있어야 하는지"를
 * 여기에 못박고, 하나라도 없으면 zip 을 지운다.
 */
function verifyZip(zipPath) {
  const { execFileSync } = require('child_process');
  const REQUIRED = [
    'index.html',
    'interpretation.html',
    'auth-gate.js',
    'dist/law.bundle.js',
    'dist/interpretation.bundle.js',
    'db/offline-law.js',
    'db/offline-interp.js',
    'sql-wasm-b64.js',
  ];

  let listing;
  try {
    listing = execFileSync('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      "Add-Type -AssemblyName System.IO.Compression.FileSystem; "
      + `$z = [System.IO.Compression.ZipFile]::OpenRead('${zipPath}'); `
      + "try { $z.Entries | ForEach-Object { $_.FullName } } finally { $z.Dispose() }",
    ], { encoding: 'utf8' });
  } catch (err) {
    console.error('  ✖ zip 을 열어 확인하지 못했습니다:', err.message);
    return false;
  }

  const entries = new Set(listing.split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
  const missing = REQUIRED.filter((f) => !entries.has(f));
  const backslash = [...entries].filter((e) => e.includes('\\'));

  if (missing.length || backslash.length) {
    console.error('\n  ✖ zip 완결성 검사 실패');
    for (const f of missing) console.error(`     빠짐: ${f}`);
    if (backslash.length) {
      console.error(`     경로 구분자가 백슬래시인 항목 ${backslash.length}개 `
        + '(zip 규격 위반 — 다른 압축 도구에서 폴더 구조가 깨진다)');
    }
    return false;
  }

  console.log(`  ✓ 완결성 검사 통과 (필수 ${REQUIRED.length}종, 항목 ${entries.size}개, 경로 정규화 OK)`);
  return true;
}

/**
 * 오프라인 사본용 서비스워커 스텁.
 * 파일이 이미 전부 로컬에 있으므로 캐싱할 것이 없고, 오히려 낡은 사본을 붙잡아 둘 수 있다.
 * 등록되면 스스로 물러난다(이전에 등록된 워커도 함께 정리).
 */
const SW_STUB = `self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (event) {
  event.waitUntil(self.registration.unregister().then(function () {
    return self.clients.matchAll();
  }));
});
`;

const README = `LawQuery 오프라인 사본
======================

인터넷 연결 없이, 브라우저만으로 동작합니다. 별도 설치는 필요하지 않습니다.

[여는 방법]

방법 1. 사내 서버·공유폴더에 올려서 쓰기 (권장)
  이 폴더를 웹서버 문서 디렉토리에 통째로 올리고 주소로 접속하면 됩니다.
  법령을 고를 때마다 필요한 데이터만 읽어 가장 빠릅니다.

방법 2. 이 PC 에서 바로 열기
  index.html 을 더블클릭합니다.
  ※ 이 방식은 file:// 배포본(폴더 안에 db/offline-law.js 가 있는 것)이어야 동작합니다.
     브라우저가 보안상 로컬 파일을 직접 읽지 못하게 막기 때문입니다.

[담긴 내용]
  - 국내 법령 전체 (법-시행령-감독규정-시행세칙-별표 연계표 포함)
  - 금융위 유권해석·비조치의견서
  - 해외법령은 포함되지 않습니다.

[알아두실 점]
  - 데이터 기준일은 화면 상단 바에 표시됩니다. 최신 개정을 반영하려면 새 사본을 받으세요.
  - 즐겨찾기는 이 브라우저 안에만 저장됩니다(서버로 전송되지 않습니다).
  - 회원가입·로그인이 없으며 모든 기능이 열려 있습니다.
`;

main();
