import { precApi, PrecDetail, PrecItem } from './PrecApi';

/**
 * 판례·헌재결정의 목록·본문을 그리는 HTML 조각 — 연계표의 조문 판례 창과 판례검색 화면(prec.html)이 함께 쓴다.
 * 눌렀을 때의 동작은 부르는 쪽이 `data-prec`(목록 줄)·`data-prec-more`·`data-prec-back` 로 받는다.
 */
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** 글을 escape 하고 marks 의 문구를 <mark> 로 감싼다(문구 안의 띄어쓰기는 없어도·여럿이어도 맞춘다). */
export function hl(text: string, marks: string[]): string {
  const keys = marks.filter(Boolean);
  if (!keys.length || !text) return esc(text);
  const re = new RegExp([...keys].sort((a, b) => b.length - a.length).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*')).join('|'), 'gi');
  let out = '';
  let last = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (!m[0]) continue;
    out += esc(text.slice(last, i)) + `<mark>${esc(m[0])}</mark>`;
    last = i + m[0].length;
  }
  return out + esc(text.slice(last));
}

/** 법원 갈래 — 색 글자·짧은 이름용. sc: 대법원 · cc: 헌법재판소 · lc: 그 밖의 법원·기관 */
export function courtClass(it: PrecItem): 'sc' | 'cc' | 'lc' {
  return it.src === 'detc' ? 'cc' : it.court === '대법원' ? 'sc' : 'lc';
}

/** 법원 이름. 법원명이 비어 오는 것(국세 심판례 등)은 법제처가 적은 출처로 대신한다. */
export const courtName = (it: PrecItem) => it.court || it.source || '';

const meta = (it: PrecItem) => [it.date, courtName(it), it.caseNo].filter(Boolean).map(esc).join(' · ');

export function renderPrecList(items: PrecItem[], more: boolean): string {
  if (!items.length) return '<div class="lq-prec__empty">찾은 판례가 없습니다.</div>';
  return `<ul class="lq-prec__list">${items.map((it) => `
      <li><button type="button" class="lq-prec__item" data-prec="${esc(it.id)}">
        <span class="lq-prec__meta">${meta(it)}${it.type ? ` <span class="lq-prec__type">${esc(it.type)}</span>` : ''}</span>
        <span class="lq-prec__title">${esc(it.title || '(사건명 없음)')}</span>
      </button></li>`).join('')}</ul>`
    + (more ? '<button type="button" class="btn btn-sm btn-outline-secondary lq-prec__more" data-prec-more>더 보기</button>' : '');
}

const section = (title: string, text: string, marks: string[], open = true) => (text
  ? `<details class="lq-prec__sec"${open ? ' open' : ''}><summary>${title}</summary><div class="lq-prec__text">${hl(text, marks)}</div></details>`
  : '');

/** 사건 머리(날짜·법원·사건번호 + 사건명). */
export function renderPrecCase(d: PrecItem): string {
  return `<div class="lq-prec__case">
      <div class="lq-prec__meta">${meta(d)}${d.kind ? ` · ${esc(d.kind)}` : ''}${d.type ? ` <span class="lq-prec__type">${esc(d.type)}</span>` : ''}</div>
      <div class="lq-prec__title">${esc(d.title || '(사건명 없음)')}</div>
    </div>`;
}

/**
 * 본문 토막들 — 판시사항·요지·조문은 펼쳐 두고 전문은 접어 둔다(길다). marks 는 형광 표시할 문구.
 * 헌재결정은 이름만 다르다(결정요지·심판대상조문·전문).
 */
export function renderPrecSections(d: PrecDetail, marks: string[] = []): string {
  const cc = d.src === 'detc';
  const none = !d.holding && !d.summary && !d.body;
  return section('판시사항', d.holding, marks)
    + section(cc ? '결정요지' : '판결요지', d.summary, marks)
    + section('심판대상조문', d.target, marks)
    + section('참조조문', d.refLaws, marks)
    + section('참조판례', d.refCases, marks)
    + section(cc ? '전문' : '판례내용', d.body, marks, !d.holding && !d.summary)
    + (none ? '<div class="lq-prec__empty">본문이 제공되지 않는 판례입니다. 법령정보센터에서 확인하세요.</div>' : '');
}

/** 조문 판례 창의 본문 — '← 목록' 머리 + 사건 + 토막들. */
export function renderPrecDetail(d: PrecDetail, marks: string[] = []): string {
  return `
    <div class="lq-prec__head">
      <button type="button" class="btn btn-sm btn-outline-secondary" data-prec-back>← 목록</button>
      <a class="btn btn-sm btn-link" href="${precApi.publicUrl(d.id)}" target="_blank" rel="noopener noreferrer">법령정보센터 ↗</a>
    </div>
    ${renderPrecCase(d)}
    ${renderPrecSections(d, marks)}`;
}
