import { LinkTableData, LinkTableArticle, LinkTableSeg } from '../models/ForeignFetchModel';

/**
 * 일본 결제법 계열 3단 연계표 — 국내 5단 연계표의 일본판.
 *   단(열) = 법 · 시행령 · 부령. 법 조를 기준(anchor)으로, 그 조를 인용·시행하는 시행령·부령 조를
 *   같은 밴드(tbody)에 rowspan 정렬.
 *   가독성:
 *     · 표시언어 모드(mode) — 국문(3열, 기본) / 원문(3열) / 원문+국문(6열). 국내처럼 단일언어 넓은 열이 기본.
 *     · 법 조는 '인용된 항(項)'만 노출 + '전체 조 펼치기' 토글 — 정의조(69항) 같은 벽을 방지.
 *   부령 트랙(전자결제수단등거래업자 / 자금이동업자)은 상단 토글.
 *   본문 인용을 자동 추출한 best-effort 연계('자동추출' 표기).
 */
export type LinkTableMode = 'ko' | 'orig' | 'both';
const FAMILY_TABS: Array<{ key: string; label: string }> = [
  { key: 'jp_epi', label: '전자결제수단등거래업자' },
  { key: 'jp_funds', label: '자금이동업자' },
];
const MODE_TABS: Array<{ key: LinkTableMode; label: string }> = [
  { key: 'ko', label: '국문' },
  { key: 'orig', label: '원문' },
  { key: 'both', label: '원문+국문' },
];
const LANGS: Record<LinkTableMode, Array<'o' | 'k'>> = { ko: ['k'], orig: ['o'], both: ['o', 'k'] };

export class ForeignLinkTableView {
  render(data: LinkTableData, mode: LinkTableMode = 'ko'): string {
    const { tiers, content, bands } = data;
    const lawC = content[tiers.law.code] || {};
    const enfC = content[tiers.enf.code] || {};
    const subC = content[tiers.sub.code] || {};
    const langs = LANGS[mode];
    const ncol = 3 * langs.length;

    let html = `<div class="container-fluid flt-wrap">`;
    html += `<div class="fm-back"><a href="foreign.html"><i class="fas fa-arrow-left"></i> 해외법령 목록</a></div>`;
    html += `<div class="flt-head">
      <h4 class="mb-1">일본 자금결제법 계열 · 3단 연계표</h4>
      <div class="text-muted small">법 → 시행령 → 부령 위임체인. 법 조를 인용·시행하는 하위규정 조를 나란히 배치
        <span class="fm-links-auto" title="본문의 조문 인용을 자동 추출한 연계입니다(참고용 — 큐레이션 아님)">자동추출</span></div>
    </div>`;

    // 툴바: 부령 트랙 + 표시언어
    html += `<div class="flt-toolbar">`;
    html += `<div class="flt-tabs"><span class="flt-tabs-lb">부령 트랙</span>`;
    for (const t of FAMILY_TABS) {
      const active = t.key === data.family ? ' active' : '';
      html += `<button type="button" class="flt-tab${active}" data-family="${t.key}">${this.esc(t.label)} 부령</button>`;
    }
    html += `</div>`;
    html += `<div class="flt-tabs"><span class="flt-tabs-lb">연계</span>`;
    for (const rt of [{ key: 'deleg', label: '위임만' }, { key: 'all', label: '전체 참조' }]) {
      const active = rt.key === data.rel ? ' active' : '';
      const tip = rt.key === 'deleg' ? '법 조가 위임한 하위규정(…に規定する…で定める)만 — 정확도 높음'
        : '법 조를 인용한 모든 하위규정(정의 인용 등 포함) — 넓지만 잡음 많음';
      html += `<button type="button" class="flt-rel${active}" data-rel="${rt.key}" title="${this.esc(tip)}">${rt.label}</button>`;
    }
    html += `</div>`;
    html += `<div class="flt-tabs"><span class="flt-tabs-lb">표시</span>`;
    for (const m of MODE_TABS) {
      const active = m.key === mode ? ' active' : '';
      html += `<button type="button" class="flt-mode${active}" data-mode="${m.key}">${m.label}</button>`;
    }
    html += `</div></div>`;

    if (!bands.length) {
      html += `<div class="alert alert-warning">이 계열에서 ${data.rel === 'deleg' ? '위임' : '참조'} 연계가 없습니다.${data.rel === 'deleg' ? ' ‘전체 참조’로 전환해 보세요.' : ''}</div></div>`;
      return html;
    }

    const w = (100 / ncol).toFixed(2);
    html += `<div class="table-responsive flt-table-wrap"><table class="table table-bordered flt-table flt-cols-${ncol}">`;
    html += `<colgroup>${Array(ncol).fill(`<col style="width:${w}%">`).join('')}</colgroup>`;
    // sticky 는 .flt-table thead th 의 position:sticky(z-index 2 < 드롭다운 1000)로. Bootstrap .sticky-top(z 1020)은 드롭다운을 덮어 미사용.
    html += `<thead>`;
    // tier 헤더(각 tier colspan = 언어 수)
    html += `<tr class="flt-thead-tier">
      <th colspan="${langs.length}" class="flt-h-law">${this.esc(tiers.law.title)}</th>
      <th colspan="${langs.length}" class="flt-h-enf">${this.esc(tiers.enf.title)}</th>
      <th colspan="${langs.length}" class="flt-h-sub">${this.esc(tiers.sub.title)}</th>
    </tr>`;
    if (langs.length > 1) {
      const lh = langs.map(l => `<th>${l === 'o' ? '원문' : '국문'}</th>`).join('');
      html += `<tr class="flt-thead-lang">${lh}${lh}${lh}</tr>`;
    }
    html += `</thead>`;

    for (const b of bands) {
      html += this.band(lawC[b.law], b.enf.map(a => enfC[a]), b.sub.map(a => subC[a]),
        tiers.law.code, tiers.enf.code, tiers.sub.code, b.lawParas, langs);
    }

    html += `</table></div></div>`;
    return html;
  }

  /** 법 조 하나 밴드(tbody). 법 셀 rowspan, 시행령·부령 조를 행으로 정렬. langs = 표시언어 슬롯. */
  private band(law: LinkTableArticle | undefined, enf: (LinkTableArticle | undefined)[],
               sub: (LinkTableArticle | undefined)[], lawCode: string, enfCode: string, subCode: string,
               lawParas: string[], langs: Array<'o' | 'k'>): string {
    const N = Math.max(1, enf.length, sub.length);
    const hl = new Set(lawParas);
    let rows = '';
    for (let i = 0; i < N; i++) {
      let tr = '<tr>';
      if (i === 0) {
        for (const l of langs) tr += this.dataCell(law, l, 'flt-law', lawCode, N, hl);
      }
      tr += this.tierCells(enf, i, N, 'flt-enf', enfCode, langs);
      tr += this.tierCells(sub, i, N, 'flt-sub', subCode, langs);
      tr += '</tr>';
      rows += tr;
    }
    return `<tbody class="flt-band">${rows}</tbody>`;
  }

  /** 시행령/부령 열 — 행 i 의 조 셀(언어 슬롯만큼), 목록 끝나면 빈 칸 하나로 rowspan 병합. */
  private tierCells(list: (LinkTableArticle | undefined)[], i: number, N: number, cls: string, code: string,
                    langs: Array<'o' | 'k'>): string {
    if (i < list.length) {
      return langs.map(l => this.dataCell(list[i], l, cls, code, 1)).join('');
    }
    if (i === list.length) {
      const span = N - list.length;
      const rs = span > 1 ? ` rowspan="${span}"` : '';
      return langs.map(l => `<td class="${cls} flt-${l} flt-blank"${rs}></td>`).join('');
    }
    return ''; // 위 rowspan 에 병합됨
  }

  /** 한 셀(원문 'o' | 국문 'k'). 조 라벨(단일뷰 링크) + 항 seg 블록. hl 있으면(법 셀) 인용 항만 노출 + 펼치기. */
  private dataCell(art: LinkTableArticle | undefined, lang: 'o' | 'k', cls: string, code: string,
                   rowspan: number, hl?: Set<string>): string {
    const rs = rowspan > 1 ? ` rowspan="${rowspan}"` : '';
    return `<td class="${cls} flt-${lang}"${rs}>${this.cellInner(art, lang, code, hl)}</td>`;
  }

  private cellInner(art: LinkTableArticle | undefined, lang: 'o' | 'k', code: string, hl?: Set<string>): string {
    if (!art) return '';
    const head = lang === 'o' ? (art.heading || '') : (art.heading_ko || '');
    const label = `제${this.esc(art.article)}조`;
    const anchor = 'fa-' + String(art.article).replace(/[^a-zA-Z0-9]/g, '_');
    const link = `<a class="flt-artno" href="foreign.html?code=${encodeURIComponent(code)}#${anchor}" `
      + `title="단일 법 보기로 이동">${label}${head ? ` <span class="flt-head">${this.esc(head)}</span>` : ''}</a>`;
    return link + this.segs(art.segs, lang, hl);
  }

  /**
   * 조 안의 항/호 seg 블록 — **전문(全文) 표시**(법 통독용). 위임된 법 항(項)만 강조(flt-hl),
   * 나머지는 그대로 표시. 강조 판정은 항 seg 에서 켜고 이어지는 号(item) seg 가 승계.
   */
  private segs(list: LinkTableSeg[], lang: 'o' | 'k', hl?: Set<string>): string {
    if (!list.length) return `<div class="flt-body flt-empty">— 내용 없음 —</div>`;
    let on = false, out = '';
    for (const s of list) {
      if (s.kind === 'paragraph' || s.kind === 'article') on = !!(hl && s.para && hl.has(s.para));
      const text = lang === 'o' ? s.original : s.ko;
      const body = text ? this.esc(text) : (lang === 'k' ? '<span class="flt-empty">— 번역 준비중 —</span>' : '');
      const tag = (s.para && s.kind !== 'item') ? `<span class="flt-para">${this.esc(s.para)}</span>` : '';
      out += `<div class="flt-seg${on ? ' flt-hl' : ''}">${tag}${body}</div>`;
    }
    return out;
  }

  private esc(s: string): string {
    return String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  }
}
