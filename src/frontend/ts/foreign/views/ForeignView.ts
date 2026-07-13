import { ForeignLawMeta, ForeignProvision, ForeignLinkMap, ForeignLinkRef } from '../models/ForeignFetchModel';

/** 조 본문(seg) 행 렌더에 필요한 컨텍스트 — 지연 mount 시 컨트롤러가 renderArticleRows 로 재사용. */
export interface SegRenderCtx {
  code: string;
  memos: Record<string, string>;
  showMemo: boolean;
  cols: number;
  canEdit: boolean;
  canEditMemo: boolean;
  canFavorite: boolean;
  favorites: Set<string>;
}

/**
 * 이 seg 수를 넘는 대형 법령은 조 본문을 '지연 mount'(뷰포트 근처 조만 실제 행 생성)한다.
 * 초기엔 조 헤더 + 추정높이 placeholder 만 그려 8~14MB DOM 을 한 번에 파싱하던 렉을 없앤다.
 * (Reg E 9,481 / Reg Z 10,940 조항 등. 소형 법령은 종전대로 전부 즉시 렌더.)
 */
export const FOREIGN_LAZY_THRESHOLD = 1500;

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

  renderTable(meta: ForeignLawMeta, provisions: ForeignProvision[], memos: Record<string, string>, canEditMemo: boolean, canEdit = false, favorites: Set<string> = new Set(), canFavorite = false, links: ForeignLinkMap = {}): string {
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
      ${this.familyButton(meta.code)}
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
    //
    // 대형 법령(FOREIGN_LAZY_THRESHOLD 초과)은 여기서 조 본문(seg 행)을 아예 안 그리고, 조 헤더 +
    // 추정높이 placeholder 만 그린다(data-lazy). 컨트롤러가 IntersectionObserver 로 뷰포트 근처
    // 조만 renderArticleRows 로 실제 mount → 초기 innerHTML 파싱을 수백 행으로 줄여 렉을 없앤다.
    // (조 헤더 id 는 항상 존재 → 목차·딥링크 앵커·스크롤 복원은 그대로 동작.)
    const lazy = provisions.length > FOREIGN_LAZY_THRESHOLD;
    const ctx: SegRenderCtx = { code: meta.code, memos, showMemo, cols, canEdit, canEditMemo, canFavorite, favorites };
    const groupHeights = this.computeGroupHeights(provisions);

    // 문서 순서를 지키며 조 단위로 묶는다.
    const order: string[] = [];
    const byArticle = new Map<string, ForeignProvision[]>();
    for (const seg of provisions) {
      let arr = byArticle.get(seg.article_no);
      if (!arr) { byArticle.set(seg.article_no, arr = []); order.push(seg.article_no); }
      arr.push(seg);
    }

    let lastPart: string | null = null;
    for (const articleNo of order) {
      const segs = byArticle.get(articleNo)!;
      const head = segs[0];
      // 추정 높이는 큰 조(예: 6,719 seg 짜리 Supplement)에서 수백만 px 로 폭증해 스크롤바가
      // 사실상 사라지므로 상한을 둔다. mount 후엔 content-visibility(auto)가 실측 높이를 기억한다.
      const h = Math.min(groupHeights.get(articleNo) || 200, 3000);
      const lazyAttr = lazy ? ` data-lazy="1" data-article="${this.esc(articleNo)}"` : '';
      html += `<tbody class="fm-art-group"${lazyAttr} style="contain-intrinsic-size: auto ${h}px;">`;
      if (head.part_no && head.part_no !== lastPart) {
        lastPart = head.part_no;
        html += `<tr class="fm-part"><td colspan="${cols}">${this.esc(head.part_no)}</td></tr>`;
      }
      const headCls = /^ANNEX/i.test(articleNo) ? ' fm-annex'
        : /^RECITAL/i.test(articleNo) ? ' fm-recital'
        : /^PRE:/i.test(articleNo) ? ' fm-preamble' : '';
      html += `<tr class="fm-art-head${headCls}" id="${this.articleId(articleNo)}" data-pid="${head.provision_id}"><td colspan="${cols}">${this.headInner(head, canEdit)}${this.linkBar(articleNo, links)}</td></tr>`;
      if (lazy) {
        // 본문 자리를 예약하는 placeholder(추정 본문 높이). content-visibility 가 화면 밖에선
        // contain-intrinsic-size 로, 화면 안에선 이 높이로 자리를 지켜 mount 전에도 스크롤 좌표가 안정.
        const bodyH = Math.max(30, h - 64);
        html += `<tr class="fm-lazy-ph" aria-hidden="true"><td colspan="${cols}" style="height:${bodyH}px;border:0"></td></tr>`;
      } else {
        html += this.renderArticleRows(segs, ctx);
      }
      html += `</tbody>`;
    }
    html += `</table></div>`;
    return html;
  }

  /**
   * 한 조(article)의 seg 본문 행(<tr class="fm-seg">)들을 렌더. 즉시 렌더(renderTable)와
   * 지연 mount(컨트롤러의 IntersectionObserver)가 공용 → seg 행 생성 로직의 단일 출처.
   */
  renderArticleRows(segs: ForeignProvision[], ctx: SegRenderCtx): string {
    let html = '';
    for (const seg of segs) {
      // 계층 들여쓰기 — 원자 seg 의 depth(1=subsection … 6=subclause)로 원문·번역 셀을 단계별 들여쓴다.
      // (depth 1 을 기준 0 으로. 프론트가 '뭉치정보=depth'로 재조합해 트리 outline 처럼 보인다.)
      const dep = Math.max(0, (seg.depth ?? 1) - 1);
      const pad = dep ? ` style="padding-left:${(0.5 + dep * 1.1).toFixed(2)}rem"` : '';
      const key = `${seg.article_no}|${seg.seg_index}`;
      const memo = ctx.memos[key];
      // 즐겨찾기(회원별 개인 북마크) — 로그인 회원에게만 별·강조 노출(favorites는 회원만 로드).
      // 별 버튼은 원문셀(fm-en)에 둔다(모든 회원에게 있는 셀 — 메모칸은 운영자에게만 있으므로).
      const fav = ctx.canFavorite && ctx.favorites.has(key);
      const favBtn = ctx.canFavorite ? this.favBtn(seg, fav) : '';
      html += `<tr class="fm-seg${fav ? ' fm-fav' : ''}" data-pid="${seg.provision_id}">
        <td class="fm-en" data-field="text_original"${pad}>${favBtn}${this.cellInner('text_original', seg, ctx.canEdit)}</td>
        <td class="fm-ko-cell" data-field="text_ko"${pad}>${this.cellInner('text_ko', seg, ctx.canEdit)}</td>
        ${ctx.showMemo ? this.memoCell(ctx.code, seg, memo, ctx.canEditMemo) : ''}
      </tr>`;
    }
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
    const badge = canEdit ? this.reviewBadge(prov, field) : '';
    const edited = canEdit && prov.overridden?.includes(field) ? this.editedTag('fm-revert-cell') : '';
    // 서문/recital(seg_kind='preamble')은 원본이 '1 recital = 1 통짜 문단'(관보 원문에 문장 사이 개행
    // 없음)이라 셀이 매우 길다 → 표시할 때만 문장 단위로 줄바꿈(원본 데이터·복사·편집은 불변).
    const asBody = (t: string | null): string =>
      prov.seg_kind === 'preamble' ? this.splitToSentences(t || '') : (t || '');
    if (field === 'text_original') {
      return `${copy}${pen}${badge}${edited}<div class="fm-en-body">${this.renderRich(asBody(prov.text_original))}</div>`;
    }
    const ko = prov.text_ko
      ? `<div class="fm-ko">${this.renderRich(asBody(prov.text_ko))}</div>`
      : `<div class="fm-ko fm-empty">— 번역 준비중 —</div>`;
    return `${copy}${pen}${badge}${edited}${ko}`;
  }

  /**
   * 서문/recital 표시용 문장 분리 — 문장 경계에만 개행 삽입(원본 문자열 미변경, 렌더 전용).
   * 복사/편집은 컨트롤러의 pidMap 원본값을 쓰므로 영향 없음. 오분리 방지: 영어는 이니셜(한 글자
   * 대문자) 뒤 마침표 제외, 한국어는 '…다.'/'…요.' 등 종결형만. 이미 개행이 있으면 그대로 존중.
   */
  private splitToSentences(s: string): string {
    return String(s ?? '')
      // 영어: 소문자/숫자/닫는괄호·따옴표 뒤 종결부호 + 공백 + 대문자/여는괄호(이니셜 'E.' 등 오분리 방지).
      // (lookbehind 미사용 — 구형 Safari 호환)
      .replace(/([a-z0-9)\]”"’])([.?!])\s+(?=[A-Z(“"‘])/g, '$1$2\n')
      .replace(/([다요죠음함][.?!])\s+(?=\S)/g, '$1\n') // 한국어 종결형
      .replace(/\n{2,}/g, '\n');
  }

  /**
   * '수정됨' 태그 + X(원본 복귀) 버튼 — 관리자가 교정본이 원본을 가리고 있음을 상시 확인·취소.
   *   상류(fin_law_db)가 이 셀에서 바뀌어도 교정이 덮어 표시되므로, 이 태그로 '수정됨'을 항상 보여주고
   *   X 로 즉시 원본 복귀(교정 삭제)한다. hover 없이도 보이게 인라인 표시(발견성). scss 의존 없음.
   *   revertCls = 되돌리기 위임 클래스('fm-revert-cell' | 'fm-revert-head').
   */
  private editedTag(revertCls: string): string {
    // 다른 버튼(copy/pen/fav)과 동일하게 float:right → 본문을 밀지 않고 우측에 뜬다(상시 표시).
    return `<span class="fm-edited" title="관리자 교정본이 원본 위에 표시 중입니다. ✕를 누르면 원본으로 되돌립니다."`
      + ` style="float:right;margin:0 0 .25rem .4rem;display:inline-flex;align-items:center;gap:.1rem;padding:0 .05rem 0 .4rem;font-size:.68rem;line-height:1.5;color:#3730a3;background:#eef2ff;border:1px solid #c7d2fe;border-radius:.35rem;white-space:nowrap;">`
      + `수정됨<button type="button" class="${revertCls}" title="이 교정 취소(원본으로 되돌림)"`
      + ` style="border:0;background:transparent;color:#4338ca;cursor:pointer;font-size:.8rem;line-height:1;padding:.05rem .25rem;">✕</button></span>`;
  }

  /**
   * 관리자 전용 '교정 재확인' 뱃지 — 재적재로 원문이 바뀌어 교정이 억제(stale)됐거나, 지문 없는
   * 구버전(legacy) 교정임을 알린다. 억제된 교정은 공개에 노출되지 않고(오염 방지) 관리자만 이 뱃지를 본다.
   * (scss 의존 없이 인라인 스타일 — 관리자 화면 한정 보조 표시라 가볍게 유지)
   */
  private reviewBadge(prov: ForeignProvision, field: string): string {
    const r = prov.review?.find(x => x.field === field);
    if (!r) return '';
    const stale = r.kind === 'stale';
    const label = stale ? '⚠ 교정 재확인' : '⚠ 미검증 교정';
    const tip = stale
      ? `원문이 바뀌어 이 교정이 자동 적용되지 않았습니다. 현재 원문을 확인하고 다시 저장하세요.${r.prev ? '\n\n[이전 교정값]\n' + r.prev : ''}`
      : '지문 없는 구버전 교정입니다(재적재 시 위치가 어긋날 수 있음). 확인 후 다시 저장하면 지문이 채워집니다.';
    const col = stale ? '#b91c1c' : '#b45309';
    const bg = stale ? '#fef2f2' : '#fffbeb';
    const bd = stale ? '#fecaca' : '#fde68a';
    return `<span class="fm-review" title="${this.esc(tip)}" style="float:right;margin:0 0 .25rem .4rem;padding:0 .35rem;font-size:.68rem;line-height:1.5;color:${col};background:${bg};border:1px solid ${bd};border-radius:.35rem;white-space:nowrap;cursor:help;">${label}</span>`;
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
    const isRecital = /^RECITAL/i.test(prov.article_no);
    const isPreamble = /^PRE:/i.test(prov.article_no);
    const koTitle = (prov.heading_ko || '').trim();
    const enTitle = (prov.heading || '').trim();
    const title = isRecital
      ? '전문 <span class="fm-toc-en">Recitals · 제·개정 이유</span>'
      : isPreamble
      ? `<span class="fm-preamble-tag">📋 제·개정 이유</span> ${this.esc(enTitle || prov.article_no)}`
        + (koTitle ? ` <span class="fm-toc-en">${this.esc(koTitle)}</span>` : '')
      : isAnnex
      ? this.esc(enTitle || prov.article_no)
      : `제${this.esc(prov.article_no)}조` +
        (koTitle ? ` ${this.esc(koTitle)}` : '') +
        (enTitle ? ` <span class="fm-toc-en">${this.esc(enTitle)}</span>` : '');
    const pen = canEdit
      ? `<button type="button" class="fm-admin-edit fm-edit-head" title="제목 수정"><i class="fas fa-pen"></i></button>`
      : '';
    const badge = canEdit ? this.reviewBadge(prov, 'heading_ko') + this.reviewBadge(prov, 'heading') : '';
    const headEdited = canEdit && (prov.overridden?.includes('heading') || prov.overridden?.includes('heading_ko'));
    const edited = headEdited ? this.editedTag('fm-revert-head') : '';
    return `${pen}<span class="fm-art-title">${title}</span>${badge}${edited}`;
  }

  /** 일본 결제법 계열 법이면 '3단 연계표 보기' 버튼(부령 트랙 결정). 아니면 빈 문자열. */
  private familyButton(code: string): string {
    const fam = code === 'jp_funds_transfer_co' ? 'jp_funds'
      : (['jp_psa', 'jp_psa_enf', 'jp_epi_co'].includes(code) ? 'jp_epi' : null);
    if (!fam) return '';
    return `<div class="mt-2"><a class="btn btn-sm btn-primary flt-open-btn" href="foreign.html?link=${fam}">`
      + `<i class="fas fa-diagram-project"></i> 계열 3단 연계표 보기 (법·시행령·부령)</a></div>`;
  }

  // ── 일본법 하위규정 연계 칩(자동 추출) ────────────────────────────────────────
  /**
   * 조 헤더에 붙는 연계 바 — 인용(이 조 → 상대 조) / 피인용(상대 조 → 이 조).
   * 칩 클릭 = 상대 법령 조로 이동(cross-law, 항상 다른 code). 연계 없으면 빈 문자열.
   * 국내 5단 연계표의 해외(일본) 대응물이나, 본문 인용을 자동 추출한 best-effort 라 '자동추출' 표기.
   */
  private linkBar(articleNo: string, links: ForeignLinkMap): string {
    const l = links[articleNo];
    if (!l || (!l.refs.length && !l.citedBy.length)) return '';
    const CAP = 14; // 조당 방향별 칩 상한(초과분은 '외 N건')
    const chip = (r: ForeignLinkRef, dir: 'out' | 'in'): string => {
      const deleg = r.kind === 'delegates';
      const artLabel = `제${r.article}조` + (dir === 'out' && r.para ? ` ${r.para}항` : '');
      const kindNote = deleg ? (dir === 'in' ? ' — 이 조를 시행하는 위임규정' : ' — 위임 근거') : '';
      const title = `${r.title_ko} 제${r.article}조${r.para ? ` ${r.para}항` : ''}${kindNote}`;
      return `<a class="fm-link-chip${deleg ? ' fm-link-deleg' : ''}" `
        + `href="foreign.html?code=${encodeURIComponent(r.code)}#${this.articleId(r.article)}" `
        + `data-code="${this.esc(r.code)}" data-anchor="${this.articleId(r.article)}" title="${this.esc(title)}">`
        + `<span class="fm-link-nm">${this.esc(this.shortLawName(r))}</span> ${this.esc(artLabel)}</a>`;
    };
    const group = (arr: ForeignLinkRef[], dir: 'out' | 'in', label: string, icon: string): string => {
      if (!arr.length) return '';
      const shown = arr.slice(0, CAP).map(r => chip(r, dir)).join('');
      const more = arr.length > CAP ? `<span class="fm-link-more">외 ${arr.length - CAP}건</span>` : '';
      return `<div class="fm-links-row"><span class="fm-links-lb"><i class="fas ${icon}"></i> ${label}</span>${shown}${more}</div>`;
    };
    return `<div class="fm-links">
      <div class="fm-links-head"><i class="fas fa-diagram-project"></i> 하위규정 연계`
      + ` <span class="fm-links-auto" title="본문의 조문 인용을 자동 추출한 연계입니다(참고용 — 큐레이션 아님)">자동추출</span></div>`
      + group(l.refs, 'out', '인용', 'fa-arrow-up-right-from-square')
      + group(l.citedBy, 'in', '피인용', 'fa-arrow-turn-down')
      + `</div>`;
  }

  /** 칩용 짧은 법령명 — 약칭 우선, 길면 절단(전체는 title 툴팁). */
  private shortLawName(r: ForeignLinkRef): string {
    const n = (r.abbrev || r.title_ko || r.code).replace(/^일본\s*/, '');
    return n.length > 13 ? n.slice(0, 12) + '…' : n;
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
    const isRecital = /^RECITAL/i.test(seg.article_no);
    const isPreamble = /^PRE:/i.test(seg.article_no);
    const label = isRecital ? '전문'
      : isPreamble ? this.esc(this.cut((seg.heading || '').split(' · ')[0] || '제·개정이유', 16))
      : isAnnex ? this.esc(seg.article_no)
      : `제${this.esc(seg.article_no)}조`;
    const ko = (seg.heading_ko || '').trim();
    const en = (seg.heading || '').trim();
    let h = '';
    if (!isAnnex && !isRecital && !isPreamble && (ko || en)) {
      const koPart = ko ? this.esc(this.cut(ko, 20)) : '';
      const enPart = en ? `<span class="fm-toc-en">${this.esc(this.cut(en, 26))}</span>` : '';
      h = ` <span class="fm-toc-h">${[koPart, enPart].filter(Boolean).join(' ')}</span>`;
    }
    const full = isRecital
      ? '전문 (Recitals) · 제·개정 이유'
      : isPreamble
      ? (seg.heading || seg.article_no)
      : isAnnex
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
