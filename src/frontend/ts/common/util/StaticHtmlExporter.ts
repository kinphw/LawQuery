/**
 * StaticHtmlExporter
 * ------------------------------------------------------------------
 * 현재 '조회 화면'(해외법령 본문 · PSD 이행분석)을 자기완결 정적 HTML 파일로 내보낸다.
 * 의사결정자에게 원문·번역·이행검토 표를 그대로 전달하는 것이 목적이라:
 *   · 사이트 헤더·검색·필터·탭·백링크 등 내비/개인화 UI는 떼어낸다.
 *   · 복사·수정·즐겨찾기(★) 같은 조작 버튼과 회원별 강조도 없앤다.
 *   · 자바스크립트는 넣지 않는다(정적 문서). 남은 링크는 페이지 내부 앵커(#..)와
 *     외부 http(s)만 살리고, 상대 이동 링크는 텍스트(참조 라벨)로 굳힌다.
 *   · '뷰가 예뻐야' 하므로 페이지가 실제로 쓰는 CSS(부트스트랩·style.css·인라인 <style>)를
 *     그 자리에서 읽어 <style> 로 심는다 → 표 스타일이 보존된다.
 *   · 폰트어썸은 폰트 파일이 함께 저장되지 못해 아이콘이 깨지므로 CSS를 제외하고,
 *     아이콘 요소는 제거하되 의미 있는 화살표(→·←)만 글자로 바꾼다.
 */

export interface StaticExportOptions {
  /** 스냅샷할 콘텐츠 컨테이너. 이 요소의 사본(innerHTML)을 정제해 문서 본문으로 쓴다. */
  source: HTMLElement;
  /** 문서 제목(브라우저 탭/파일명 용). */
  title: string;
  /** 다운로드 파일명(확장자는 자동 보정). */
  filename: string;
  /** 사본에서 통째로 제거할 요소 선택자(조작·내비 UI). */
  removeSelectors?: string[];
  /** 문서 하단 작은 주석(출처·번역 참고 고지 등). 평문. */
  footnote?: string;
  /** 스냅샷(복제) 직전에 실행 — 대형 법령의 지연 mount 전량 펼치기 등. */
  beforeSnapshot?: () => void | Promise<void>;
  /** 표준 정제 후, 뷰별 추가 손질(예: 빈 메모 열 제거)을 사본에 적용. */
  transformClone?: (clone: HTMLElement) => void;
}

/** 폰트 없이는 못 그리는 폰트어썸 아이콘 중, 의미가 있어 글자로 바꿔 남길 것들. */
const FA_ICON_TO_TEXT: Array<[RegExp, string]> = [
  [/fa-arrow-right\b/, ' → '],
  [/fa-long-arrow-alt-right\b/, ' → '],
  [/fa-arrow-left\b/, ' ← '],
];

/** 저장본·인쇄 보정 + 밝은 톤 고정. 항상 마지막에 붙여 우선 적용한다. */
const EXPORT_OVERRIDE_CSS = `
/* ── LawQuery 내보내기 문서 보정 ── */
html, body { scroll-behavior: auto !important; }
body { margin: 0; padding: 24px 20px 40px; background: #fff; color: #212529;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.lq-export-body { max-width: 1760px; margin: 0 auto; }
.lq-export-foot { max-width: 1760px; margin: 34px auto 0; padding-top: 12px;
  border-top: 1px solid #dee2e6; color: #868e96; font-size: .78rem; line-height: 1.65; }
/* 화면 밖 렌더 스킵(content-visibility)은 저장본에서 내용이 비어 보일 수 있어 해제 */
.fm-table tbody.fm-art-group, .pta-article, .flt-band {
  content-visibility: visible !important; contain-intrinsic-size: auto !important; }
/* 저장본은 항상 밝게 — 요약표가 열람자 다크모드를 상속하지 않도록 */
@media (prefers-color-scheme: dark) {
  .ptt-table, .ptt-table thead th, .ptt-table th, .ptt-table td,
  .ptt-table tbody tr:nth-child(even) {
    background: #fff !important; color: #212529 !important; border-color: #dfe3e9 !important; }
  .ptt-art-line, .ptt-change, .ptt-art-line b { color: #2c3440 !important; }
}
`;

/** 조회 화면 하나를 정적 HTML 파일로 내보낸다(복제→정제→CSS 인라인→다운로드). */
export async function exportViewAsHtml(opts: StaticExportOptions): Promise<void> {
  if (opts.beforeSnapshot) await opts.beforeSnapshot();

  const clone = opts.source.cloneNode(true) as HTMLElement;
  sanitizeClone(clone, opts.removeSelectors || []);
  if (opts.transformClone) opts.transformClone(clone);

  const css = await collectPageCss();
  const html = buildDocument(opts.title, clone.innerHTML, css, opts.footnote);
  downloadHtml(ensureHtmlExt(opts.filename), html);
}

/** 사본에서 조작·개인화·내비 잔재를 걷어낸다. */
function sanitizeClone(root: HTMLElement, removeSelectors: string[]): void {
  // 1) 뷰별로 지정한 UI 통째 제거(백링크·탭·툴바·필터·연계표 버튼 등).
  for (const sel of removeSelectors) root.querySelectorAll(sel).forEach(el => el.remove());

  // 2) 상호작용 요소 잔재 제거 — 정적 문서라 동작하지 않는다(복사·수정·즐겨찾기·검색·비교 등).
  root.querySelectorAll('script, button, input, select, textarea, form').forEach(el => el.remove());

  // 3) 링크 정리 — 내부 앵커(#..)와 외부 http(s)만 살린다. 상대 이동 링크(다른 화면으로)는
  //    참조 라벨(칩)만 남기고 텍스트로 굳힌다(스타일 클래스는 보존).
  root.querySelectorAll('a').forEach(a => {
    const href = a.getAttribute('href') || '';
    if (href.startsWith('#')) { a.removeAttribute('target'); return; }
    if (/^https?:\/\//i.test(href)) { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener'); return; }
    deLink(a); // 상대 페이지 이동 → 텍스트 라벨
  });

  // 4) 폰트어썸 아이콘 — 폰트 미동봉이라 못 그린다. 의미 있는 화살표만 글자로, 나머지는 제거.
  root.querySelectorAll('i.fa, i.fas, i.far, i.fab, i[class*="fa-"]').forEach(icon => {
    const cls = icon.getAttribute('class') || '';
    const hit = FA_ICON_TO_TEXT.find(([re]) => re.test(cls));
    if (hit) icon.replaceWith(document.createTextNode(hit[1]));
    else icon.remove();
  });

  // 5) 회원별 즐겨찾기 강조(행 하이라이트) 제거 — 개인화 흔적.
  root.querySelectorAll('.fm-fav').forEach(el => el.classList.remove('fm-fav'));

  // 6) 편집 가능 표식 정리.
  root.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
}

/** <a> 를 같은 클래스의 <span> 으로 치환 — 링크 동작만 없애고 라벨/스타일은 유지. */
function deLink(a: Element): void {
  const span = document.createElement('span');
  const cls = a.getAttribute('class');
  if (cls) span.setAttribute('class', cls);
  span.innerHTML = a.innerHTML;
  a.replaceWith(span);
}

/** 페이지가 실제 로드한 CSS를 문서 순서대로 모은다(폰트어썸 제외 → 보정 CSS 마지막). */
async function collectPageCss(): Promise<string> {
  const parts: string[] = [];
  const nodes = Array.from(document.head.querySelectorAll('link[rel="stylesheet"], style'));
  for (const node of nodes) {
    if (node.tagName === 'STYLE') {
      parts.push(node.textContent || '');
      continue;
    }
    const href = node.getAttribute('href') || '';
    // 폰트어썸(fontawesome.min / all.min)은 웹폰트에 의존 → 저장본에선 깨지므로 제외.
    if (!href || /fontawesome|all\.min\.css/i.test(href)) continue;
    try {
      const res = await fetch(href);
      if (res.ok) parts.push(`/* ${href} */\n${await res.text()}`);
    } catch { /* 개별 스타일 실패는 무시하고 진행 */ }
  }
  parts.push(EXPORT_OVERRIDE_CSS);
  return parts.join('\n\n');
}

function buildDocument(title: string, bodyHtml: string, css: string, footnote?: string): string {
  const foot = footnote ? `<div class="lq-export-foot">${escapeHtml(footnote)}</div>` : '';
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(title)}</title>
<style>${css}</style>
</head>
<body>
<div class="lq-export-body">
${bodyHtml}
</div>
${foot}
</body>
</html>`;
}

function downloadHtml(filename: string, html: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** 파일명에서 금지문자 제거 + .html 보정. */
function ensureHtmlExt(name: string): string {
  const safe = name.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim() || 'export';
  return /\.html?$/i.test(safe) ? safe : `${safe}.html`;
}

function escapeHtml(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/**
 * 해외법령 본문 사본에서 '메모' 열을 정리한다.
 *   · 메모 내용이 하나도 없으면(운영자가 열람 중이나 메모 미작성 등) 열 통째 제거 →
 *     빈 열이 남지 않게. 이때 조 헤더/편·장 행의 colspan 도 1 줄인다.
 *   · 내용이 있으면 열은 남기되 편집 어포던스('+ 메모' 등)만 제거.
 * 메모 열 자체가 없으면(showMemo=false) 아무것도 하지 않는다.
 */
export function tidyForeignMemoColumn(clone: HTMLElement): void {
  const hasMemoColumn = !!clone.querySelector('th.fm-col-memo');
  if (!hasMemoColumn) return;

  const hasContent = Array.from(clone.querySelectorAll('.fm-memo-view'))
    .some(v => (v.textContent || '').trim().length > 0);

  if (hasContent) {
    clone.querySelectorAll('.fm-memo-add').forEach(el => el.remove());
    return;
  }

  // 빈 메모 열 제거: 헤더 th + 각 seg 행의 메모 td, colspan 3→2.
  clone.querySelectorAll('th.fm-col-memo').forEach(el => el.remove());
  clone.querySelectorAll('td.fm-memo, td.fm-memo-ro, td.fm-memo-admin').forEach(el => el.remove());
  clone.querySelectorAll('tr.fm-art-head > td[colspan], tr.fm-part > td[colspan]').forEach(td => {
    const n = Number(td.getAttribute('colspan') || '1');
    if (n > 1) td.setAttribute('colspan', String(n - 1));
  });
}
