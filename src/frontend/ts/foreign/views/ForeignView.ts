import { ForeignLawMeta, ForeignProvision } from '../models/ForeignFetchModel';

/**
 * 해외법령 뷰 (seg-level) — 1 row = 1 seg.
 * part(편/장) 그룹 → article 그룹 헤더(첫 seg heading, 목차 앵커) → seg 별 [원문|번역|메모] 행.
 * 메모는 (article_no, seg_index) 논리키. 표 seg(markdown)는 renderRich 가 <table> 로 렌더.
 */
export class ForeignView {
  private statusLabel(s: string): string {
    const map: Record<string, string> = {
      in_force: '시행 중', enacted: '제정', proposal: '제안(미발효)',
      passed_one_chamber: '일원 통과(미발효)', unknown: '',
    };
    return map[s] || s;
  }

  private transLabel(s: string): string {
    if (s === 'machine') return '기계번역(참고용)';
    if (s === 'official') return '공식번역';
    return '';
  }

  /** article_no → 안정 앵커 id */
  private articleId(articleNo: string): string {
    return 'fa-' + String(articleNo).replace(/[^a-zA-Z0-9]/g, '_');
  }

  renderTable(meta: ForeignLawMeta, provisions: ForeignProvision[], memos: Record<string, string>, canEditMemo: boolean, canEdit = false, favorites: Set<string> = new Set(), canFavorite = false): string {
    const trans = this.transLabel(meta.translation_source);
    const status = this.statusLabel(meta.status);
    // 메모(운영자 큐레이션) 칸은 운영자이거나 표시할 메모가 있을 때만 노출 → 빈 칸 낭비 방지.
    const showMemo = canEditMemo || Object.keys(memos).length > 0;
    const cols = showMemo ? 3 : 2;

    const introHtml = meta.summary ? `<div class="fm-intro">
        <div class="fm-intro-summary">${this.esc(meta.summary)}</div>
        ${meta.highlights && meta.highlights.length
          ? `<ul class="fm-intro-hi">${meta.highlights.map(h => `<li>${this.esc(h)}</li>`).join('')}</ul>`
          : ''}
        ${meta.source_url ? `<div class="fm-intro-src"><a href="${this.esc(meta.source_url)}" target="_blank" rel="noopener"><i class="fas fa-up-right-from-square"></i> 원문 출처</a></div>` : ''}
      </div>` : '';

    let html = `<div class="container-fluid fm-wrap">`;
    html += `<div class="fm-back"><a href="foreign.html"><i class="fas fa-arrow-left"></i> 해외법령 목록</a></div>`;
    html += `<div class="fm-law-head">
      <h4 class="mb-1">${this.esc(meta.title_ko)}${meta.abbrev ? ` <span class="text-muted fs-6">(${this.esc(meta.abbrev)})</span>` : ''}</h4>
      <div class="text-muted small">${this.esc(meta.title_original)}</div>
      <div class="small mt-1">
        ${status ? `<span class="badge bg-secondary">${status}</span>` : ''}
        ${meta.is_crypto ? '<span class="badge bg-info text-dark">가상자산</span>' : ''}
        ${trans ? `<span class="badge bg-light text-dark border">${trans}</span>` : ''}
      </div>
      ${meta.official_citation ? `<div class="small text-secondary mt-1">인용양식: ${this.esc(meta.official_citation)}</div>` : ''}
    </div>`;
    html += introHtml;

    if (!provisions.length) {
      html += `<div class="alert alert-warning">표시할 조문이 없습니다.</div></div>`;
      return html;
    }

    html += this.buildToc(provisions);

    html += `<table class="table table-bordered fm-table"><thead><tr>
      <th class="fm-col-en">원문</th>
      <th class="fm-col-ko">국문 번역</th>
      ${showMemo ? '<th class="fm-col-memo">메모</th>' : ''}
    </tr></thead>`;

    // 조(article)마다 별도 <tbody class="fm-art-group"> + content-visibility:auto →
    // 화면 밖 조는 레이아웃/페인트를 건너뛴다(국내 대형 연계표와 동일 윈도잉).
    // ⇒ 8천 행짜리 대형 법령에서도 셀 편집(메모·본문) 시 표 전체가 아니라 '보이는 조'만 재배치 → 렉 제거.
    // contain-intrinsic-size 는 조별 실제 콘텐츠 길이로 미리 계산해 넣는다(고정 200px이면 화면 밖
    // 조들의 높이를 심하게 과소평가해 목차 바로가기가 실제 위치보다 한참 못 미친 곳으로 스크롤된다).
    const groupHeights = this.computeGroupHeights(provisions);
    let lastPart: string | null = null;
    let lastArticle: string | null = null;
    let openGroup = false;
    for (const seg of provisions) {
      if (seg.article_no !== lastArticle) {
        if (openGroup) html += `</tbody>`;
        const h = groupHeights.get(seg.article_no) || 200;
        html += `<tbody class="fm-art-group" style="contain-intrinsic-size: auto ${h}px;">`;
        openGroup = true;
        lastArticle = seg.article_no;
        if (seg.part_no && seg.part_no !== lastPart) {
          lastPart = seg.part_no;
          html += `<tr class="fm-part"><td colspan="${cols}">${this.esc(seg.part_no)}</td></tr>`;
        }
        const isAnnex = /^ANNEX/i.test(seg.article_no);
        html += `<tr class="fm-art-head${isAnnex ? ' fm-annex' : ''}" id="${this.articleId(seg.article_no)}" data-pid="${seg.provision_id}"><td colspan="${cols}">${this.headInner(seg, canEdit)}</td></tr>`;
      } else if (seg.part_no && seg.part_no !== lastPart) {
        // (드묾) 조 중간에서 편/장이 바뀌는 경우 — 현재 그룹 안에 편/장 행을 넣는다.
        lastPart = seg.part_no;
        html += `<tr class="fm-part"><td colspan="${cols}">${this.esc(seg.part_no)}</td></tr>`;
      }
      // 계층 들여쓰기 — 원자 seg 의 depth(1=subsection … 6=subclause)로 원문·번역 셀을 단계별 들여쓴다.
      // (depth 1 을 기준 0 으로. 프론트가 '뭉치정보=depth'로 재조합해 트리 outline 처럼 보인다.)
      const dep = Math.max(0, (seg.depth ?? 1) - 1);
      const pad = dep ? ` style="padding-left:${(0.5 + dep * 1.1).toFixed(2)}rem"` : '';
      const key = `${seg.article_no}|${seg.seg_index}`;
      const memo = memos[key];
      // 즐겨찾기(회원별 개인 북마크) — 로그인 회원에게만 별·강조 노출(favorites는 회원만 로드).
      // 별 버튼은 원문셀(fm-en)에 둔다(모든 회원에게 있는 셀 — 메모칸은 운영자에게만 있으므로).
      const fav = canFavorite && favorites.has(key);
      const favBtn = canFavorite ? this.favBtn(seg, fav) : '';
      html += `<tr class="fm-seg${fav ? ' fm-fav' : ''}" data-pid="${seg.provision_id}">
        <td class="fm-en" data-field="text_original"${pad}>${favBtn}${this.cellInner('text_original', seg, canEdit)}</td>
        <td class="fm-ko-cell" data-field="text_ko"${pad}>${this.cellInner('text_ko', seg, canEdit)}</td>
        ${showMemo ? this.memoCell(meta.code, seg, memo, canEditMemo) : ''}
      </tr>`;
    }
    if (openGroup) html += `</tbody>`;
    html += `</table></div>`;
    return html;
  }

  /** 조(article_no)별 세그를 묶어 estimateGroupHeight 를 미리 계산한다. */
  private computeGroupHeights(provisions: ForeignProvision[]): Map<string, number> {
    const byArticle = new Map<string, ForeignProvision[]>();
    for (const p of provisions) {
      const arr = byArticle.get(p.article_no);
      if (arr) arr.push(p); else byArticle.set(p.article_no, [p]);
    }
    const heights = new Map<string, number>();
    byArticle.forEach((segs, articleNo) => heights.set(articleNo, this.estimateGroupHeight(segs)));
    return heights;
  }

  /**
   * 조 하나(tbody.fm-art-group)의 예상 렌더 높이(px, 대략치) — content-visibility:auto 의
   * contain-intrinsic-size 로 쓰인다. 정확할 필요는 없고 실제와 자릿수만 맞으면 된다(고정
   * 200px 추정치는 원문/번역 텍스트가 긴 조에서 실제보다 훨씬 작아 목차 바로가기가 크게
   * 빗나간다). 모바일은 원문·번역 셀이 세로로 쌓이므로(반응형 @media max-width:768px) 두
   * 필드를 더하는 쪽(둘 중 큰 값이 아니라)으로 보수적으로 잡는다.
   */
  private estimateGroupHeight(segs: ForeignProvision[]): number {
    const CHARS_PER_LINE = 42; // 좁은 화면 기준 보수적으로(과소추정 방지)
    const LINE_H = 24;         // line-height 1.55 * ~15px 폰트
    const ROW_OVERHEAD = 28;   // 셀 패딩 + tr 경계/여백
    let h = 64; // 조 헤더 행(fm-art-head) + 표 상단 여백
    for (const seg of segs) {
      h += this.estimateCellHeight(seg.text_original, CHARS_PER_LINE, LINE_H);
      h += this.estimateCellHeight(seg.text_ko, CHARS_PER_LINE, LINE_H);
      h += ROW_OVERHEAD;
    }
    // 실측 보정 계수: 위 문자수 기반 어림값은 실제 렌더 높이보다 평균 26~36% 작게 나온다
    // (줄바꿈 여백·마크다운 표 셀 패딩 등 미반영분). 과소추정이 "한참 못 미친 곳" 버그의
    // 원인이었으므로 넉넉히 보정한다(다소 과대추정돼도 목차 점프 UX엔 지장 없음).
    return Math.round(h * 1.4);
  }

  private estimateCellHeight(text: string | null | undefined, charsPerLine: number, lineH: number): number {
    const s = String(text ?? '');
    if (!s) return lineH; // 빈 칸도 "번역 준비중" 한 줄
    let lines = 0;
    for (const ln of s.split('\n')) {
      lines += /^\s*\|.*\|\s*$/.test(ln) ? 1.4 : Math.max(1, Math.ceil(ln.length / charsPerLine));
    }
    return Math.max(1, lines) * lineH;
  }

  /**
   * 원문/번역 셀 내부(복사버튼 + 관리자 수정버튼 + 본문). 인라인 수정 종료/저장 후 셀 복원에도 재사용.
   * → 셀 단위 교체라 거대 표라도 그 셀만 다시 그린다(table-layout:fixed → 열너비 재계산 없음).
   * 복사는 렌더된 HTML이 아니라 원본 문자열을 그대로 복사(컨트롤러가 pidMap 원본값 사용) — 여기선 버튼만 표시.
   */
  cellInner(field: 'text_original' | 'text_ko', prov: ForeignProvision, canEdit: boolean): string {
    const text = field === 'text_original' ? prov.text_original : prov.text_ko;
    const copy = text
      ? `<button type="button" class="fm-copy-btn" data-field="${field}" title="클립보드에 복사"><i class="fas fa-copy"></i></button>`
      : '';
    const pen = canEdit
      ? `<button type="button" class="fm-admin-edit fm-edit-cell" title="${field === 'text_ko' ? '번역' : '원문'} 수정"><i class="fas fa-pen"></i></button>`
      : '';
    if (field === 'text_original') {
      return `${copy}${pen}<div class="fm-en-body">${this.renderRich(prov.text_original || '')}</div>`;
    }
    const ko = prov.text_ko
      ? `<div class="fm-ko">${this.renderRich(prov.text_ko)}</div>`
      : `<div class="fm-ko fm-empty">— 번역 준비중 —</div>`;
    return `${copy}${pen}${ko}`;
  }

  /**
   * 즐겨찾기(★) 토글 버튼 — 회원별 개인 북마크. 원문셀(fm-en) 우상단에 복사버튼과 함께 뜬다.
   * 켜면 행 전체가 강조색(fm-fav). data-article/data-seg 로 논리키를 실어 컨트롤러가 토글.
   */
  private favBtn(seg: ForeignProvision, fav: boolean): string {
    return `<button type="button" class="fm-fav-toggle${fav ? ' fm-fav-on' : ''}" aria-pressed="${fav}" data-article="${this.esc(seg.article_no)}" data-seg="${seg.seg_index}" title="즐겨찾기 — 내 강조표시(나만 보임)"><i class="fas fa-star"></i></button>`;
  }

  /**
   * 메모 셀(운영자 큐레이션). 운영자=편집 가능(클릭 시 .fm-memo 위임), 일반=읽기 전용 표시.
   * 빈 메모는 운영자에겐 '+ 메모' 플레이스홀더, 일반 사용자에겐 빈 칸.
   */
  private memoCell(code: string, seg: ForeignProvision, memo: string | undefined, canEditMemo: boolean): string {
    if (canEditMemo) {
      const inner = memo ? this.esc(memo) : '<span class="fm-memo-add">+ 메모</span>';
      return `<td class="fm-memo fm-memo-admin" data-code="${this.esc(code)}" data-article="${this.esc(seg.article_no)}" data-seg="${seg.seg_index}">
             <div class="fm-memo-view">${inner}</div>
           </td>`;
    }
    return `<td class="fm-memo-ro">${memo ? `<div class="fm-memo-view">${this.esc(memo)}</div>` : ''}</td>`;
  }

  /** 조 헤더 셀 내부(수정버튼 + 제목). 제목 수정 종료/저장 후 복원에도 재사용. */
  headInner(prov: ForeignProvision, canEdit: boolean): string {
    const isAnnex = /^ANNEX/i.test(prov.article_no);
    const koTitle = (prov.heading_ko || '').trim();
    const enTitle = (prov.heading || '').trim();
    const title = isAnnex
      ? this.esc(enTitle || prov.article_no)
      : `제${this.esc(prov.article_no)}조` +
        (koTitle ? ` ${this.esc(koTitle)}` : '') +
        (enTitle ? ` <span class="fm-toc-en">${this.esc(enTitle)}</span>` : '');
    const pen = canEdit
      ? `<button type="button" class="fm-admin-edit fm-edit-head" title="제목 수정"><i class="fas fa-pen"></i></button>`
      : '';
    return `${pen}<span class="fm-art-title">${title}</span>`;
  }

  /**
   * 관리자 제목 수정 후, 그 조의 목차 칩(<a>) 하나만 제자리 교체용 { selector, html }.
   * 옛 코드는 제목 저장 시마다 목차 전체(편/장 헤더 + 모든 조 칩)를 outerHTML 로 재생성했는데,
   * 대형 법령(예: eu_crr 741조)에선 매 저장마다 무거운 재파싱·리플로우였다 → 바뀐 칩 하나만 갱신한다.
   */
  tocChip(seg: ForeignProvision): { selector: string; html: string } {
    return {
      selector: `a.fm-toc-item[href="#${this.articleId(seg.article_no)}"]`,
      html: this.tocItem(seg),
    };
  }

  /** 조문 목차(편/장 그룹 + 조 칩, article 단위). 칩 클릭 시 article 헤더로 스크롤. */
  private buildToc(provisions: ForeignProvision[]): string {
    let body = '';
    let lastPart: string | null = null;
    for (const seg of provisions) {
      if (seg.seg_index !== 1) continue; // article 첫 seg = article 대표
      if (seg.part_no && seg.part_no !== lastPart) {
        lastPart = seg.part_no;
        body += `<div class="fm-toc-part">${this.esc(this.cut(seg.part_no, 70))}</div>`;
      }
      body += this.tocItem(seg);
    }
    return `<div class="fm-toc"><div class="fm-toc-title"><i class="fas fa-list-ul"></i> 조문 목차 · 바로가기</div><div class="fm-toc-body">${body}</div></div>`;
  }

  /** 목차 칩(조 <a>) 하나의 HTML. buildToc(전체)와 tocChip(단일 갱신)이 공용. */
  private tocItem(seg: ForeignProvision): string {
    const isAnnex = /^ANNEX/i.test(seg.article_no);
    const label = isAnnex ? this.esc(seg.article_no) : `제${this.esc(seg.article_no)}조`;
    const ko = (seg.heading_ko || '').trim();
    const en = (seg.heading || '').trim();
    let h = '';
    if (!isAnnex && (ko || en)) {
      const koPart = ko ? this.esc(this.cut(ko, 20)) : '';
      const enPart = en ? `<span class="fm-toc-en">${this.esc(this.cut(en, 26))}</span>` : '';
      h = ` <span class="fm-toc-h">${[koPart, enPart].filter(Boolean).join(' ')}</span>`;
    }
    const full = isAnnex
      ? (seg.heading || seg.article_no)
      : `제${seg.article_no}조 ${[ko, en].filter(Boolean).join(' / ')}`.trim();
    return `<a class="fm-toc-item" href="#${this.articleId(seg.article_no)}" title="${this.esc(full)}">${label}${h}</a>`;
  }

  private cut(s: string, n: number): string {
    s = String(s ?? '');
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  /** 마크다운 표(| … |)가 있으면 표로, 나머지는 개행 정리 후 문단으로. */
  private renderRich(s: string): string {
    const raw = String(s ?? '');
    if (!/^\s*\|.*\|\s*$/m.test(raw)) {
      return `<div class="fm-flow">${this.esc(this.normalize(raw))}</div>`;
    }
    const lines = raw.split('\n');
    let html = '';
    let tbl: string[] = [];
    let para: string[] = [];
    const flushTable = () => { if (tbl.length) { html += this.mdTable(tbl); tbl = []; } };
    const flushPara = () => {
      if (para.length) {
        const t = para.join('\n').trim();
        if (t) html += `<div class="fm-flow">${this.esc(this.normalize(t))}</div>`;
        para = [];
      }
    };
    for (const ln of lines) {
      if (/^\s*\|.*\|\s*$/.test(ln)) { flushPara(); tbl.push(ln); }
      else { flushTable(); para.push(ln); }
    }
    flushTable(); flushPara();
    return html;
  }

  private mdTable(rows: string[]): string {
    const cells = (r: string) =>
      r.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());
    const body = rows.filter(r => !/^\s*\|[\s:|-]+\|\s*$/.test(r));
    if (!body.length) return '';
    let h = '<table class="table table-sm table-bordered fm-md-table"><thead><tr>';
    h += cells(body[0]).map(c => `<th>${this.esc(c)}</th>`).join('') + '</tr></thead><tbody>';
    for (const r of body.slice(1)) {
      h += '<tr>' + cells(r).map(c => `<td>${this.esc(c)}</td>`).join('') + '</tr>';
    }
    return h + '</tbody></table>';
  }

  /**
   * 본문 정리 — 개행·들여쓰기는 보존한다(.fm-flow 는 white-space:pre-wrap 로 렌더).
   * STN 적재 본문은 항목/중첩 구조를 개행 + 2칸/단계 들여쓰기로 표현하므로 그대로 살린다.
   * 하는 일은 (1) CRLF→LF, (2) 줄 내부 잡공백(2칸↑)·줄끝 공백만 제거(선두 들여쓰기는 유지),
   * (3) '마커만 있는 줄' 합치기(joinLoneMarkers), (4) 빈 줄 3개↑ → 1개, (5) 앞뒤 빈 줄 제거.
   * ※ 과거엔 '항목마커 앞을 뺀 모든 개행을 공백으로 합침'(PDF 하드랩 가정)이었으나,
   *   실제 데이터는 의도된 구조 개행이라 중첩 계층이 통째로 사라지는 버그였다.
   */
  private normalize(s: string): string {
    const lines = String(s ?? '')
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map(ln => {
        const indent = (ln.match(/^[ \t]*/) as RegExpMatchArray)[0];
        const body = ln.slice(indent.length).replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+$/, '');
        return indent + body;
      });
    return this.joinLoneMarkers(lines).join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, '');
  }

  /**
   * '마커만 있는 줄'((A)·(iv)·(12) 등 괄호형)을 바로 다음 내용 줄과 합친다.
   * 단 다음 줄도 '마커만 있는 줄'이면(상위 마커가 하위 마커를 품는 계층) 합치지 않고 유지한다.
   * → us_bill 파서가 enum 을 항상 자기 줄로 직렬화해 "(A)\n  내용" 이 되던 걸 "(A) 내용" 으로
   *   되돌려 가독성을 확보한다(원문·번역 공통·무손실, 재적재/재번역 없음). 마커 판정은 괄호를
   *   강제해 "and"/"or" 같은 단어 오탐을 차단하고, 다음 줄이 "(A)항…" 처럼 마커로 시작하는
   *   '내용'이면(전체가 마커만은 아니므로) 정상 합쳐진다.
   */
  private joinLoneMarkers(lines: string[]): string[] {
    const MARK = /^\([A-Za-z0-9]{1,6}\)$/; // 줄 전체가 괄호형 마커
    const out: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const cur = lines[i];
      const body = cur.trim();
      const nxt = lines[i + 1];
      if (nxt != null && MARK.test(body)) {
        const nxtBody = nxt.trim();
        if (nxtBody && !MARK.test(nxtBody)) {
          const indent = (cur.match(/^[ \t]*/) as RegExpMatchArray)[0];
          out.push(indent + body + ' ' + nxtBody);
          i++; // 다음 줄 소비
          continue;
        }
      }
      out.push(cur);
    }
    return out;
  }

  private esc(s: string): string {
    return String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  }
}
