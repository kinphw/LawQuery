const fs = require('fs');
const path = require('path');

const changelogPath = path.join(__dirname, '..', 'assets', 'changelog.json');
const readmePath = path.join(__dirname, '..', 'README.md');

const changelog = JSON.parse(fs.readFileSync(changelogPath, 'utf-8'));
const version = changelog.version;
const date = changelog.logs && changelog.logs[0] ? changelog.logs[0].date : '';

const versionLine = `${version} (${date})`;

// Markdown 표 생성
const changelogTable =
  `| 버전 | 일자 | 수정사항 |\n|------|------|----------|\n` +
  changelog.logs.map(log =>
    `| ${log.ver} | ${log.date} | ${log.desc.replace(/\n/g, '<br>')} |`
  ).join('\n');

let readme = fs.readFileSync(readmePath, 'utf-8');

// 버전 정보 갱신
readme = readme.replace(
  /<!-- CHANGELOG_VERSION_START -->([\s\S]*?)<!-- CHANGELOG_VERSION_END -->/,
  `<!-- CHANGELOG_VERSION_START -->\n${versionLine}\n<!-- CHANGELOG_VERSION_END -->`
);

// changelog 표 갱신
readme = readme.replace(
  /<!-- CHANGELOG_TABLE_START -->([\s\S]*?)<!-- CHANGELOG_TABLE_END -->/,
  `<!-- CHANGELOG_TABLE_START -->\n${changelogTable}\n<!-- CHANGELOG_TABLE_END -->`
);

fs.writeFileSync(readmePath, readme, 'utf-8');
console.log('README.md 버전 및 changelog가 changelog.json과 동기화되었습니다.');