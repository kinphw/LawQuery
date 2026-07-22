import { ForeignLawMeta, ForeignProvision } from '../../foreign/models/ForeignFetchModel';
import {
  ChangeType,
  PsdLawCode,
  ReviewStatus,
  StructuralType,
  ThemeImpact,
  TransitionArticleAnalysis,
  TransitionCatalog,
  TransitionCounterpart,
  TransitionRelation,
  TransitionTheme,
  TransitionViewData,
} from '../models/PsdTransitionFetchModel';

export type TransitionLanguageMode = 'ko' | 'original' | 'both';
export type StatusFilter = 'all' | 'conflict' | 'reviewed' | 'automatic';

/**
 * 조문 하나의 '결과'를 단일 축으로 본다: 신설 / 이행(동일이행·강화·완화·실질변경) / 이행 없음.
 * 예전엔 구조(1:1·분할·통합)와 변경유형(유지·강화…)을 별개 차원으로 나눠 필터가 두 줄이라 복잡했고
 * 배타적 조합이 0건이 되기 쉬웠다. 구조 세부(분할·통합)는 대응조문 칩이 이미 보여주므로,
 * 축을 하나로 합쳐 필터·배지를 단순화한다. 명확화는 '동일이행'에 흡수한다.
 */
export type Outcome = 'new' | 'maintained' | 'strengthened' | 'relaxed' | 'material' | 'deleted' | 'pending';

const OUTCOME_LABELS: Record<Outcome, string> = {
  new: '신설', maintained: '동일이행', strengthened: '강화', relaxed: '완화',
  material: '실질변경', deleted: '이행 없음', pending: '검토중',
};

/** 구조·변경유형(DB 2컬럼)을 화면용 단일 결과 축으로 접는다. */
export function outcomeOf(a: { structuralType: StructuralType; changeType: ChangeType }): Outcome {
  if (a.structuralType === 'new') return 'new';
  if (a.structuralType === 'deleted') return 'deleted';
  if (a.structuralType === 'pending') return 'pending';
  if (a.changeType === 'strengthened') return 'strengthened';
  if (a.changeType === 'relaxed') return 'relaxed';
  if (a.changeType === 'material_change') return 'material';
  return 'maintained'; // maintained·clarified·(내용 검토중)
}

/** 본문을 어떻게 보여줄지. detail=원문 대조(실무 이해용) / table=3단 요약표(보고서에 그대로 옮길 용도). */
export type TransitionViewMode = 'detail' | 'table';

/** '이행'(transitioned) = 세부 유형(동일이행·강화·완화·실질변경)을 묶은 상위 필터값(실제 Outcome 아님). */
export type FilterOutcome = Outcome | 'all' | 'transitioned';
/** 상위 '이행'에 접히는 세부 결과들. 이 순서로 하위 칩을 노출한다. */
const TRANSITIONED: Outcome[] = ['maintained', 'strengthened', 'relaxed', 'material'];

export interface TransitionRenderState {
  outcome: FilterOutcome;
  status: StatusFilter;
  search: string;
  language: TransitionLanguageMode;
  viewMode: TransitionViewMode;
}

/** 툴바 칩에 표시할 결과별 건수(현재 법 전체 기준). status 는 예외신호(불일치·검수)용. */
export interface FilterCounts {
  outcome: Record<string, number>;
  status: Record<string, number>;
  total: number;
}

const REVIEW_LABELS: Record<ReviewStatus, string> = {
  automatic: '자동초안', analyzed: '정밀 분석', reviewed: '검수완료',
};
const IMPACT_LABELS: Record<ThemeImpact, string> = {
  new: '신설', strengthened: '강화', relaxed: '완화', clarified: '명확화',
  restructured: '재편', maintained: '유지',
};

/**
 * 조문 렌더 대상 판정 — 숫자 조(1·2…)와 문자접미 조(110a·59b·45a)를 모두 포함한다.
 * ★ 2026 합의문은 협상에서 끼워 넣은 조문을 110a·59b 로 붙인다. '^\d+$' 로만 거르면
 *   그 신설 조문들이 상세뷰·요약표·필터에서 통째로 사라진다(실측: PSR 14조·PSD3 1조 누락).
 *   RECITAL·ANNEX 같은 비조문 seg 는 여기서 걸러진다.
 */
const ARTICLE_NO_RE = /^\d+[a-z]?$/i;

export class PsdTransitionView {
  /** 조 단위 집계 — 필터 칩의 건수. 렌더 대상(숫자·문자접미 조번호)과 같은 기준으로 센다. */
  computeCounts(provisions: ForeignProvision[], transition: TransitionViewData): FilterCounts {
    const analysisMap = new Map(transition.articles.map(a => [a.articleNo, a]));
    const seen = new Set<string>();
    const counts: FilterCounts = { outcome: {}, status: {}, total: 0 };
    for (const p of provisions) {
      if (!ARTICLE_NO_RE.test(p.article_no) || seen.has(p.article_no)) continue;
      seen.add(p.article_no);
      counts.total++;
      const a = analysisMap.get(p.article_no);
      if (!a) continue;
      const bump = (dim: Record<string, number>, key: string) => { dim[key] = (dim[key] || 0) + 1; };
      const oc = outcomeOf(a.assessment);
      bump(counts.outcome, oc);
      if (TRANSITIONED.includes(oc)) bump(counts.outcome, 'transitioned'); // 상위 '이행' 합계
      bump(counts.status, a.assessment.reviewStatus);
      if (a.relations.some(r => r.evidenceStatus === 'conflict')) bump(counts.status, 'conflict');
    }
    return counts;
  }

  renderFrame(catalog: TransitionCatalog, current: PsdLawCode, state: TransitionRenderState, body: string, counts: FilterCounts | null = null, summaryActive = false): string {
    const selected = catalog.laws.find(l => l.code === current) || catalog.laws[0];
    const sources = catalog.version.sourceUrls.map((url, i) =>
      `<a href="${this.esc(url)}" target="_blank" rel="noopener">${i === 0 ? 'PSD3' : 'PSR'} 원문 <i class="fas fa-arrow-up-right-from-square"></i></a>`
    ).join('<span class="pta-source-sep">·</span>');
    return `<div class="pta-shell">
      <div class="pta-back"><a href="foreign.html"><i class="fas fa-arrow-left"></i> 해외법령으로</a></div>
      <section class="pta-hero">
        <div>
          <div class="pta-kicker">LAWQUERY CURATED CROSSWALK</div>
          <h1>PSD 이행분석</h1>
          <p>PSD2·EMD2가 PSD3·PSR로 어떻게 이어지는지 조문별로 추적합니다.</p>
        </div>
        <div class="pta-version">
          <span class="pta-proposal">미발효·입법 진행 중</span>
          ${this.versionSelect(catalog)}
          <span>${this.esc(catalog.version.basisKo)}</span>
          <div class="pta-source-links">${sources}</div>
        </div>
      </section>
      <div class="pta-notice"><i class="fas fa-circle-info"></i> ${this.esc(catalog.version.noticeKo)}
        ${catalog.conflictCount ? `<span class="pta-conflict-count">상관표 불일치 ${catalog.conflictCount}건</span>` : ''}
      </div>
      ${this.tabs(catalog, current, summaryActive)}
      ${catalog.unlocked && !summaryActive ? this.toolbar(state, selected?.articleCount || 0, counts) : ''}
      <main id="ptaBody">${body}</main>
    </div>`;
  }

  /**
   * 버전 전환 드롭박스 — 최초본(2023)·잠정본(2026)… 게시된 버전 사이를 오간다.
   * 옵션 라벨은 긴 labelKo("…패키지 — 2026 잠정합의문")에서 '—' 뒤만 잘라 간결하게.
   * 버전이 하나뿐이면 드롭박스 없이 제목만(전환할 게 없다).
   */
  private versionSelect(catalog: TransitionCatalog): string {
    const short = (labelKo: string) => {
      const i = labelKo.lastIndexOf('—');
      return (i >= 0 ? labelKo.slice(i + 1) : labelKo).trim();
    };
    if (!catalog.versions || catalog.versions.length < 2) {
      return `<strong>${this.esc(catalog.version.labelKo)}</strong>`;
    }
    const opts = catalog.versions.map(v =>
      `<option value="${this.esc(v.code)}"${v.code === catalog.version.code ? ' selected' : ''}>${this.esc(short(v.labelKo))}</option>`
    ).join('');
    return `<label class="pta-version-switch">
      <span class="pta-version-switch-label">기준 문안</span>
      <select id="ptaVersionSelect" aria-label="이행분석 기준 문안 선택">${opts}</select>
    </label>`;
  }

  renderLocked(): string {
    return `<section class="pta-locked">
      <div class="pta-lock-icon"><i class="fas fa-lock"></i></div>
      <h2>이행분석은 연계정보 이용 권한이 필요합니다</h2>
      <p>법령 본문은 해외법령에서 계속 무료로 볼 수 있습니다. 이 화면은 공식 상관표와 조문별 변경 분석을 결합한 큐레이션 기능입니다.</p>
      <div class="d-flex gap-2 justify-content-center flex-wrap">
        <a class="btn btn-dark" href="login.html?next=foreign-transition.html">로그인</a>
        <a class="btn btn-outline-secondary" href="foreign.html">해외법령 본문 보기</a>
      </div>
    </section>`;
  }

  renderLoading(): string {
    return `<div class="pta-loading"><div class="spinner-border spinner-border-sm" role="status"></div> 이행관계와 조문을 불러오는 중…</div>`;
  }

  renderError(message: string): string {
    return `<div class="alert alert-warning my-4">${this.esc(message)}</div>`;
  }

  renderArticles(
    meta: ForeignLawMeta,
    provisions: ForeignProvision[],
    transition: TransitionViewData,
    state: TransitionRenderState,
  ): string {
    const analysisMap = new Map(transition.articles.map(a => [a.articleNo, a]));
    const groups = new Map<string, ForeignProvision[]>();
    for (const provision of provisions) {
      if (!ARTICLE_NO_RE.test(provision.article_no)) continue;
      const list = groups.get(provision.article_no);
      if (list) list.push(provision); else groups.set(provision.article_no, [provision]);
    }
    const articles = [...groups.entries()].map(([articleNo, segs]) => ({ articleNo, segs, analysis: analysisMap.get(articleNo) }))
      .filter(item => this.matches(item.segs, item.analysis, state));

    const role = meta.code === 'eu_psd2' || meta.code === 'eu_emd2' ? '현행 규정의 이행 결과' : '예정 규정의 출처';
    let html = `<div class="pta-law-head">
      <div><span class="pta-law-abbrev">${this.esc(meta.abbrev || meta.code)}</span>
        <h2>${this.esc(meta.title_ko)}</h2></div>
      <div class="pta-result-count"><strong>${articles.length}</strong>개 조문 표시 · 오른쪽은 ${role}</div>
    </div>`;
    if (!articles.length) return html + '<div class="pta-empty">조건에 맞는 조문이 없습니다.</div>';

    if (state.viewMode === 'table') return html + this.summaryTable(articles);
    for (const item of articles) html += this.article(item.articleNo, item.segs, item.analysis, state.language, transition.editable, meta.code as PsdLawCode);
    return html;
  }

  /**
   * 요약표 — 조문 · 구분 · 주요 내용 · 변경사항 4단. **HWP·엑셀에 그대로 복사해 보고서 붙임표로**
   * 쓰는 것이 1순위 용도라, 셀마다 내용을 단순하게 유지한다(복사 시 깨지지 않도록):
   *   · 조문 = "제N조 제목"을 한 줄로 붙이고(조번호+국문 제목), 영문 제목은 아랫줄 평문.
   *   · 구분 = 결과 분류(신설·강화·실질변경…). 색칠 배경 '카드'가 아니라 **평문 색글자** —
   *          배경 칩은 HWP 붙여넣기에서 음영 박스로 지저분해진다. 열로 분리해 셀이 원자적이게.
   *   · 주요 내용 = gistKo(조문이 무슨 내용인지) / 변경사항 = summaryKo(무엇이 바뀌었는지).
   * 비어 있으면 '—'.
   */
  private summaryTable(items: Array<{ articleNo: string; segs: ForeignProvision[]; analysis?: TransitionArticleAnalysis }>): string {
    const rows = items.map(item => {
      const head = item.segs.find(s => s.heading_ko || s.heading);
      const titleKo = head?.heading_ko || '';
      const titleEn = head?.heading || '';
      const gist = item.analysis?.gistKo || '';
      const change = item.analysis?.assessment.summaryKo || '';
      const outcome = item.analysis ? outcomeOf(item.analysis.assessment) : null;
      const kind = outcome
        ? `<span class="ptt-kind-txt o-${outcome}">${OUTCOME_LABELS[outcome]}</span>` : '<span class="ptt-none">—</span>';
      // 조번호 + 국문 제목을 한 줄로. 영문 제목은 국문과 다를 때만 아랫줄 평문으로.
      const titleLine = `<div class="ptt-art-line"><b>제${this.esc(item.articleNo)}조</b>${titleKo ? ' ' + this.esc(titleKo) : ''}</div>`
        + (titleEn && titleEn !== titleKo ? `<div class="ptt-title-en">${this.esc(titleEn)}</div>` : '');
      return `<tr id="pta-row-${this.esc(item.articleNo)}">
        <td class="ptt-art">${titleLine}</td>
        <td class="ptt-kind">${kind}</td>
        <td class="ptt-gist">${gist ? this.esc(gist) : '<span class="ptt-none">—</span>'}</td>
        <td class="ptt-change">${change ? this.esc(change) : '<span class="ptt-none">—</span>'}</td>
      </tr>`;
    }).join('');

    return `<div class="ptt-wrap">
      <table class="ptt-table">
        <thead><tr>
          <th class="ptt-art">조문</th>
          <th class="ptt-kind">구분</th>
          <th class="ptt-gist">주요 내용</th>
          <th class="ptt-change">변경사항</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  private tabs(catalog: TransitionCatalog, current: PsdLawCode, summaryActive: boolean): string {
    const renderGroup = (side: 'current' | 'future', label: string) => {
      const laws = catalog.laws.filter(l => l.side === side);
      return `<div class="pta-tab-group pta-tab-${side}"><span class="pta-tab-label">${label}</span>${laws.map(l => {
        const active = !summaryActive && l.code === current ? ' active' : '';
        const secondary = side === 'current'
          ? `${l.mappedCount} 이행 · ${l.deletedCount} 이행없음`
          : `${l.mappedCount} 이행 · ${l.newCount} 신설`;
        return `<button type="button" class="pta-law-tab${active}" data-code="${l.code}">
          <strong>${this.esc(l.abbrev)}</strong><small>${secondary}</small></button>`;
      }).join('')}</div>`;
    };
    // 요약 탭 — 조문별 정밀 대사를 주제로 종합한 '무엇이 바뀌었나'. 테마가 있을 때만 노출.
    const summaryTab = catalog.themeCount > 0
      ? `<div class="pta-tab-group pta-tab-summary"><span class="pta-tab-label">한눈에</span>
          <button type="button" class="pta-law-tab pta-summary-tab${summaryActive ? ' active' : ''}" data-summary="1">
            <strong>요약</strong><small>무엇이 바뀌었나 · ${catalog.themeCount}</small></button></div>`
      : '';
    // 요약 탭 유무로 그리드 열 수가 달라진다 — 없으면 현행·예정 2칸(auto 칸이 비어 오른쪽 여백이 뜨는 것 방지).
    const gridClass = summaryTab ? '' : ' pta-tabs--nosummary';
    return `<nav class="pta-tabs${gridClass}" aria-label="PSD 법령 선택">${summaryTab}${renderGroup('current', '현행 규정')}${renderGroup('future', '예정 규정')}</nav>`;
  }

  /** 정밀 요약표 — 주제별 '무엇이 바뀌었나'. 대분류로 묶고 각 카드에 근거 조문 딥링크. */
  renderThemes(themes: TransitionTheme[]): string {
    if (!themes.length) return '<div class="pta-empty">요약 데이터가 아직 없습니다.</div>';
    const byCategory = new Map<string, TransitionTheme[]>();
    for (const t of themes) (byCategory.get(t.categoryKo) || byCategory.set(t.categoryKo, []).get(t.categoryKo)!).push(t);

    const counts = themes.reduce<Record<string, number>>((acc, t) => { acc[t.impact] = (acc[t.impact] || 0) + 1; return acc; }, {});
    const legend = (['new', 'strengthened', 'clarified', 'relaxed', 'restructured', 'maintained'] as ThemeImpact[])
      .filter(k => counts[k]).map(k => `<span class="pta-theme-impact ${k}">${IMPACT_LABELS[k]} ${counts[k]}</span>`).join('');

    let html = `<section class="pta-themes">
      <div class="pta-themes-head">
        <h2>PSD3·PSR 이행 요약 — 무엇이 바뀌었나</h2>
        <p>조문별 정밀 대사를 주제로 종합했습니다. 각 항목의 <b>근거 조문</b>을 누르면 해당 조문 정밀 분석으로 이동합니다.</p>
        <div class="pta-theme-legend">${legend}</div>
      </div>`;
    for (const [category, list] of byCategory) {
      html += `<div class="pta-theme-cat"><h3>${this.esc(category)}</h3><div class="pta-theme-grid">`;
      for (const t of list) html += this.themeCard(t);
      html += '</div></div>';
    }
    return html + '</section>';
  }

  private themeCard(t: TransitionTheme): string {
    const links = t.articleLinks.map(l => {
      const abbrev = { eu_psd2: 'PSD2', eu_emd2: 'EMD2', eu_psd3: 'PSD3', eu_psr: 'PSR',
        eu_psd3_2026: 'PSD3', eu_psr_2026: 'PSR' }[l.lawCode] || l.lawCode;
      return `<a class="pta-theme-link" data-code="${l.lawCode}" data-article="${this.esc(l.articleNo)}"
        href="foreign-transition.html?code=${l.lawCode}#pta-${this.anchor(l.articleNo)}">${abbrev} 제${this.esc(l.articleNo)}조</a>`;
    }).join('');
    const refs = (t.currentRefKo || t.futureRefKo)
      ? `<div class="pta-theme-refs">
          <span class="cur">${this.esc(t.currentRefKo || '—')}</span>
          <i class="fas fa-arrow-right"></i>
          <span class="fut">${this.esc(t.futureRefKo || '—')}</span></div>`
      : '';
    // 밴드 레이아웃: 왼쪽=주제·근거(스캔용), 오른쪽=설명(읽기용). 위→아래로 쭉 내려가며 읽힌다.
    return `<article class="pta-theme-card impact-${t.impact}">
      <div class="pta-theme-meta">
        <div class="pta-theme-top">
          <span class="pta-theme-impact ${t.impact}">${IMPACT_LABELS[t.impact]}</span>
          <h4>${this.esc(t.titleKo)}</h4>
        </div>
        ${refs}
        ${links ? `<div class="pta-theme-links"><span>근거 조문</span>${links}</div>` : ''}
      </div>
      <div class="pta-theme-body">
        <p class="pta-theme-summary">${this.esc(t.summaryKo)}</p>
        ${t.detailKo ? `<p class="pta-theme-detail">${this.esc(t.detailKo)}</p>` : ''}
      </div>
    </article>`;
  }

  /**
   * 필터 = 단일 '결과' 축 한 줄(신설·동일이행·강화·완화·실질변경·이행 없음). 행 안에서는 단일 선택
   * ('전체'로 해제), 이 법에 실재하는 값만 노출. 분할·통합 같은 구조 세부는 대응조문 칩이 보여준다.
   * 상태는 이제 전부 '정밀 분석'이라 무의미 → 예외 신호(상관표 불일치·검수완료)만 별도로 남긴다.
   */
  private toolbar(state: TransitionRenderState, total: number, counts: FilterCounts | null): string {
    const modes: Array<[TransitionLanguageMode, string]> = [['ko', '한국어'], ['original', '원문'], ['both', '한·영']];

    const chip = (dim: string, value: string, label: string, active: boolean, n: number | null, cls = '') =>
      `<button type="button" class="pta-chip${cls ? ' ' + cls : ''}${active ? ' active' : ''}"
        data-dim="${dim}" data-value="${value}" aria-pressed="${active}">${this.esc(label)}${n != null ? `<b>${n}</b>` : ''}</button>`;

    // 결과 축은 2단이다. 상위: 전체·신설·이행·이행없음(·검토중). '이행'은 세부 4종을 묶은 값.
    // 하위(이행 세부: 동일이행·강화·완화·실질변경)는 '이행' 또는 그 세부 중 하나가 선택됐을 때만 편다.
    const bag = counts?.outcome || {};
    const onTransitioned = state.outcome === 'transitioned' || TRANSITIONED.includes(state.outcome as Outcome);
    const primary: Array<[string, string]> = [
      ['new', OUTCOME_LABELS.new], ['transitioned', '이행'], ['deleted', OUTCOME_LABELS.deleted], ['pending', OUTCOME_LABELS.pending],
    ];
    const primaryChips = [chip('outcome', 'all', '전체', state.outcome === 'all', null),
      ...primary.filter(([k]) => (bag[k] || 0) > 0)
        .map(([k, label]) => chip('outcome', k, label, k === 'transitioned' ? onTransitioned : state.outcome === k, bag[k], `o-${k === 'transitioned' ? 'maintained' : k}`))].join('');
    const outcomeRow = `<div class="pta-frow"><span class="pta-frow-label">결과</span><div class="pta-frow-chips">${primaryChips}</div></div>`;

    // 이행 세부(하위) — 상위 '이행' 맥락일 때만 노출해 평소 화면을 간결하게 유지한다.
    const subChips = TRANSITIONED.filter(k => (bag[k] || 0) > 0)
      .map(k => chip('outcome', k, OUTCOME_LABELS[k], state.outcome === k, bag[k], `o-${k}`)).join('');
    const subRow = onTransitioned && subChips
      ? `<div class="pta-frow pta-frow-sub"><span class="pta-frow-label">이행 세부</span><div class="pta-frow-chips">${subChips}</div></div>`
      : '';

    const conflictN = counts?.status?.conflict || 0;
    const reviewedN = counts?.status?.reviewed || 0;
    const flags = [
      conflictN ? chip('status', 'conflict', '상관표 불일치', state.status === 'conflict', conflictN) : '',
      reviewedN ? chip('status', 'reviewed', '검수완료', state.status === 'reviewed', reviewedN) : '',
    ].join('');
    const flagsRow = flags
      ? `<div class="pta-frow"><span class="pta-frow-label">그 밖에</span><div class="pta-frow-chips">${flags}</div></div>`
      : '';

    // 표 보기에서는 원문을 싣지 않으므로(3단 전부 한국어) 언어 토글을 숨긴다.
    const languageGroup = state.viewMode === 'table' ? '' : `<div class="pta-language" role="group" aria-label="본문 언어">
        ${modes.map(([value, label]) => `<button type="button" data-language="${value}" class="${state.language === value ? 'active' : ''}">${label}</button>`).join('')}
      </div>`;
    const viewModes: Array<[TransitionViewMode, string, string]> = [
      ['detail', '상세', '원문·번역 대조'],
      ['table', '요약표', '조문명·주요내용·변경사항 3단'],
    ];

    return `<div class="pta-toolbar">
      <label class="pta-search"><i class="fas fa-search"></i><input id="ptaSearch" type="search"
        value="${this.esc(state.search)}" placeholder="조문 제목·본문·분석 검색" aria-label="이행분석 검색"></label>
      <div class="pta-viewmode" role="group" aria-label="보기 방식">
        ${viewModes.map(([value, label, hint]) => `<button type="button" data-viewmode="${value}"
          class="${state.viewMode === value ? 'active' : ''}" title="${this.esc(hint)}">${label}</button>`).join('')}
      </div>
      ${languageGroup}
      <span class="pta-total">전체 ${total}개 조문</span>
    </div>
    <div class="pta-filters" aria-label="이행분석 필터">
      ${outcomeRow}
      ${subRow}
      ${flagsRow}
    </div>`;
  }

  /** 결과 축 + 예외신호(불일치·검수)를 AND 로 거른 뒤 검색어를 적용. */
  private matches(segs: ForeignProvision[], analysis: TransitionArticleAnalysis | undefined, state: TransitionRenderState): boolean {
    const anyFilter = state.outcome !== 'all' || state.status !== 'all';
    // 분석이 없는 조(준비중)는 필터를 걸면 판정 불가 → 제외. 필터가 없으면 그대로 노출.
    if (!analysis) return !anyFilter && this.hitSearch(segs, undefined, state);
    if (state.outcome !== 'all') {
      const oc = outcomeOf(analysis.assessment);
      // '이행'(transitioned)은 세부 4종을 묶은 상위값 — 그중 하나면 통과. 그 외엔 정확히 일치해야 통과.
      const ok = state.outcome === 'transitioned' ? TRANSITIONED.includes(oc) : oc === state.outcome;
      if (!ok) return false;
    }
    if (state.status !== 'all') {
      if (state.status === 'conflict') {
        if (!analysis.relations.some(r => r.evidenceStatus === 'conflict')) return false;
      } else if (analysis.assessment.reviewStatus !== state.status) return false;
    }
    return this.hitSearch(segs, analysis, state);
  }

  private hitSearch(segs: ForeignProvision[], analysis: TransitionArticleAnalysis | undefined, state: TransitionRenderState): boolean {
    const q = state.search.trim().toLocaleLowerCase();
    if (!q) return true;
    const haystack = [
      analysis?.articleNo || '', analysis?.assessment.summaryKo || '', analysis?.assessment.detailKo || '',
      ...segs.flatMap(s => [s.heading || '', s.heading_ko || '', s.text_original || '', s.text_ko || '']),
    ].join(' ').toLocaleLowerCase();
    return haystack.includes(q);
  }

  private article(
    articleNo: string,
    segs: ForeignProvision[],
    analysis: TransitionArticleAnalysis | undefined,
    language: TransitionLanguageMode,
    editable: boolean,
    lawCode: PsdLawCode,
  ): string {
    const first = segs[0];
    const koHeading = segs.find(s => s.heading_ko)?.heading_ko || '';
    const originalHeading = segs.find(s => s.heading)?.heading || '';
    const title = [`제${articleNo}조`, koHeading].filter(Boolean).join(' ');
    const originalSub = originalHeading ? `<span>${this.esc(originalHeading)}</span>` : '';
    return `<section class="pta-article" id="pta-${this.anchor(articleNo)}">
      <header class="pta-article-head"><div><strong>${this.esc(title)}</strong>${originalSub}</div>
        <a href="foreign.html?code=${lawCode}#fa-${this.anchor(articleNo)}" target="_blank" title="기존 해외법령 본문에서 열기">본문 <i class="fas fa-arrow-up-right-from-square"></i></a></header>
      <div class="pta-row">
        <div class="pta-provision">${this.provisionText(segs, language)}</div>
        <aside class="pta-analysis">${this.analysis(articleNo, analysis, editable, lawCode)}</aside>
      </div>
    </section>`;
  }

  private provisionText(segs: ForeignProvision[], language: TransitionLanguageMode): string {
    const column = (kind: 'ko' | 'original') => `<div class="pta-text-col ${kind}">
      ${language === 'both' ? `<div class="pta-text-label">${kind === 'ko' ? '한국어' : '원문'}</div>` : ''}
      ${segs.map(seg => {
        const value = kind === 'ko' ? (seg.text_ko || '') : (seg.text_original || '');
        const marker = this.marker(seg.para_no, value);
        return value ? `<div class="pta-seg depth-${Math.min(Number(seg.depth || 0), 4)}">${marker}<span>${this.esc(value)}</span></div>` : '';
      }).join('')}</div>`;
    // 한·영은 원문 → 한국어 순. 대조 기준이 원문이라 왼쪽에 두고 번역을 오른쪽에서 따라 읽는다.
    if (language === 'both') return `<div class="pta-bilingual">${column('original')}${column('ko')}</div>`;
    return column(language === 'ko' ? 'ko' : 'original');
  }

  private analysis(articleNo: string, analysis: TransitionArticleAnalysis | undefined, editable: boolean, lawCode: PsdLawCode): string {
    if (!analysis) return '<div class="pta-pending">분석 데이터 준비중</div>';
    const a = analysis.assessment;
    const outcome = outcomeOf(a);
    const counterparts = this.uniqueCounterparts(analysis.relations);
    const conflict = analysis.relations.some(r => r.evidenceStatus === 'conflict');
    const chips = counterparts.length
      ? `<div class="pta-counterparts">${counterparts.map(c => this.counterpartChip(c, articleNo, lawCode)).join('')}</div>
         ${counterparts.length > 1 ? `<button type="button" class="pta-compare-all" data-compare-self="${this.esc(articleNo)}" data-compare-self-code="${lawCode}"><i class="fas fa-code-compare"></i> 대응 ${counterparts.length}개 한번에 비교</button>` : ''}`
      : `<div class="pta-no-counterpart">${a.structuralType === 'new' ? '선행 조문 없음' : a.structuralType === 'deleted' ? '후속 조문 없음' : '대응 조문 확인중'}</div>`;
    return `<div class="pta-badges">
        <span class="pta-badge outcome ${outcome}">${OUTCOME_LABELS[outcome]}</span>
        <span class="pta-review ${a.reviewStatus}">${REVIEW_LABELS[a.reviewStatus]}</span>
      </div>
      ${chips}
      <p class="pta-summary">${this.esc(a.summaryKo)}</p>
      ${a.detailKo ? `<p class="pta-detail">${this.esc(a.detailKo)}</p>` : ''}
      ${a.similarityPct != null && a.reviewStatus === 'automatic' ? `<div class="pta-similarity"><span>영문 문언 유사도(참고)</span><strong>${Math.round(a.similarityPct)}%</strong><div><i style="width:${Math.max(2, Math.min(100, a.similarityPct))}%"></i></div></div>` : ''}
      ${conflict ? '<div class="pta-conflict"><i class="fas fa-triangle-exclamation"></i> PSD3·PSR Annex III의 대응표가 서로 다릅니다.</div>' : ''}
      ${this.evidence(analysis.relations, lawCode)}
      ${editable ? `<button type="button" class="pta-edit" data-edit-article="${this.esc(articleNo)}" data-law-code="${lawCode}"><i class="fas fa-pen"></i> 분석 검수</button>` : ''}`;
  }

  private uniqueCounterparts(relations: TransitionRelation[]): TransitionCounterpart[] {
    const map = new Map<string, TransitionCounterpart>();
    for (const relation of relations) for (const c of relation.counterparts) {
      map.set(`${c.lawCode}|${c.articleNo || ''}`, c);
    }
    return [...map.values()];
  }

  /**
   * 대응조문 칩 — 클릭하면 그 법으로 '이동'하지 않고 비교 팝업을 연다(읽던 위치 유지).
   * 대응이 1:N(분할·통합)이라 본문을 인라인으로 다 펼치면 페이지가 폭발하므로 on-demand 팝업.
   * data-compare-* 를 컨트롤러가 받아 상대 법 조문을 fetch 해 나란히 띄운다.
   */
  private counterpartChip(c: TransitionCounterpart, selfArticleNo: string, selfCode: PsdLawCode): string {
    const label = c.articleNo ? `${c.abbrev} 제${c.articleNo}조` : `${c.abbrev} ${c.displayRef}`;
    const anchor = c.articleNo ? `pta-${this.anchor(c.articleNo)}` : '';
    return `<a class="pta-counterpart" href="foreign-transition.html?code=${c.lawCode}${anchor ? '#' + anchor : ''}"
      data-compare-self="${this.esc(selfArticleNo)}" data-compare-self-code="${selfCode}"
      data-code="${c.lawCode}" data-anchor="${anchor}"
      title="${this.esc(c.displayRef)} — 클릭하면 전후 조문을 나란히 비교">${this.esc(label)} <i class="fas fa-code-compare"></i></a>`;
  }

  /**
   * 항·호 단위 공식 근거. 상관표는 '현행 → 예정' 으로 읽는 표이므로, 예정 규정에서 보고 있을 때는
   * 자기 조문이 도착지다 → 대응(현행)을 왼쪽에 두어 시간 순서대로 읽히게 뒤집는다.
   */
  private evidence(relations: TransitionRelation[], selfCode: PsdLawCode): string {
    if (!relations.length) return '';
    const selfIsCurrent = selfCode === 'eu_psd2' || selfCode === 'eu_emd2';
    const rows = relations.map(r => {
      const evidence = r.evidenceStatus === 'both' ? '양쪽 Annex III 일치'
        : r.evidenceStatus === 'conflict' ? 'Annex III 불일치'
        : r.evidenceStatus === 'psd3_annex' ? 'PSD3 Annex III' : 'PSR Annex III';
      const target = r.counterparts.length ? r.counterparts.map(c => this.esc(c.displayRef)).join(' · ') : '대응 없음';
      const self = `<strong>${r.selfRefs.map(x => this.esc(x)).join(' · ')}</strong>`;
      const pair = selfIsCurrent ? `${self}<i class="fas fa-arrow-right"></i>${target}`
                                 : `${target}<i class="fas fa-arrow-right"></i>${self}`;
      return `<div class="pta-evidence-row"><span class="${r.evidenceStatus}">${evidence}</span>
        <div>${pair}</div>
        ${r.conflictNote ? `<pre>${this.esc(r.conflictNote)}</pre>` : ''}</div>`;
    }).join('');
    return `<details class="pta-evidence"><summary>항·호 단위 공식 근거 ${relations.length}건</summary>${rows}</details>`;
  }

  /**
   * 비교 팝업 본문 — 왼쪽=기준(원)조문, 오른쪽=대응조문(1:N 이면 세로로 나열).
   * 각 패널은 현재 언어모드를 따르고, 상단에 이행 배지/요약을 얹어 "무엇이 어떻게 바뀌었나"를 한 화면에.
   */
  renderCompare(input: {
    selfCode: PsdLawCode; selfAbbrev: string; selfArticleNo: string;
    selfSegs: ForeignProvision[]; analysis: TransitionArticleAnalysis | undefined;
    others: Array<{ code: PsdLawCode; abbrev: string; articleNo: string | null; displayRef: string; segs: ForeignProvision[] }>;
    language: TransitionLanguageMode;
  }): string {
    const panel = (label: string, sub: string, segs: ForeignProvision[], code: PsdLawCode, articleNo: string | null, missing: string) => `
      <div class="ptc-panel">
        <div class="ptc-panel-head">
          <div><strong>${this.esc(label)}</strong>${sub ? `<span>${this.esc(sub)}</span>` : ''}</div>
          ${articleNo ? `<a href="foreign.html?code=${code}#fa-${this.anchor(articleNo)}" target="_blank" title="해외법령 본문에서 열기"><i class="fas fa-arrow-up-right-from-square"></i></a>` : ''}
        </div>
        <div class="ptc-panel-body">${segs.length ? this.provisionText(segs, this.language(input.language)) : `<div class="ptc-missing">${this.esc(missing)}</div>`}</div>
      </div>`;

    const a = input.analysis?.assessment;
    const badges = a ? `<div class="pta-badges">
        <span class="pta-badge outcome ${outcomeOf(a)}">${OUTCOME_LABELS[outcomeOf(a)]}</span>
        <span class="pta-review ${a.reviewStatus}">${REVIEW_LABELS[a.reviewStatus]}</span>
      </div>` : '';
    const summary = a?.summaryKo ? `<p class="ptc-summary">${this.esc(a.summaryKo)}</p>` : '';
    const selfKo = input.selfSegs.find(s => s.heading_ko)?.heading_ko || '';

    const rights = input.others.length
      ? input.others.map(o => panel(
          `${o.abbrev} ${o.articleNo ? `제${o.articleNo}조` : o.displayRef}`,
          o.segs.find(s => s.heading_ko)?.heading_ko || '',
          o.segs, o.code, o.articleNo, '해당 조문 본문을 찾지 못했습니다.')).join('')
      : `<div class="ptc-panel"><div class="ptc-panel-body"><div class="ptc-missing">대응 조문이 없습니다(신설 또는 이행 없음).</div></div></div>`;

    return `${badges}${summary}
      <div class="ptc-grid">
        <div class="ptc-side">
          <div class="ptc-side-label">기준 조문</div>
          ${panel(`${input.selfAbbrev} 제${input.selfArticleNo}조`, selfKo, input.selfSegs, input.selfCode, input.selfArticleNo, '본문 없음')}
        </div>
        ${this.transitionArrow(input.selfCode)}
        <div class="ptc-side">
          <div class="ptc-side-label">대응 조문 ${input.others.length > 1 ? `<b>${input.others.length}</b>` : ''}</div>
          ${rights}
        </div>
      </div>
      ${input.analysis ? this.evidence(input.analysis.relations, input.selfCode) : ''}`;
  }

  /**
   * 비교 팝업의 방향 화살표. 이행은 언제나 **현행(PSD2·EMD2) → 예정(PSD3·PSR)** 한 방향이지만,
   * 팝업의 왼쪽은 '기준 조문'이라 어느 법에서 열었느냐에 따라 현행이 오기도 예정이 오기도 한다.
   * 예정 규정에서 열었으면 왼쪽이 도착지이므로 화살표를 뒤집어야 시간 순서대로 읽힌다.
   */
  private transitionArrow(selfCode: PsdLawCode): string {
    const selfIsCurrent = selfCode === 'eu_psd2' || selfCode === 'eu_emd2';
    const dir = selfIsCurrent ? 'right' : 'left';
    const label = selfIsCurrent ? '기준(현행)에서 대응(예정)으로 이행' : '대응(현행)에서 기준(예정)으로 이행';
    return `<div class="ptc-arrow" title="${label}" aria-label="${label}"><i class="fas fa-arrow-${dir}"></i></div>`;
  }

  /** 비교 팝업은 좁은 패널이 2개라 '한·영'이면 세로로 길어진다 → 그대로 존중하되 helper 로 분리. */
  private language(mode: TransitionLanguageMode): TransitionLanguageMode { return mode; }

  private anchor(articleNo: string): string {
    return String(articleNo).replace(/[^a-zA-Z0-9]/g, '_');
  }

  /** 원문/번역이 이미 "1."·"(a)"로 시작하면 para_no를 한 번 더 표시하지 않는다. */
  private marker(paraNo: string | null, text: string): string {
    const raw = String(paraNo || '').trim();
    if (!raw) return '';
    const bare = raw.replace(/^[\[(]/, '').replace(/[\])]$/, '');
    const escaped = bare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const alreadyIncluded = new RegExp(`^(?:\\(${escaped}\\)|${escaped}[.)]?)\\s`, 'i').test(String(text || '').trimStart());
    return alreadyIncluded ? '' : `<span class="pta-para">${this.esc(raw)}</span>`;
  }

  private esc(value: any): string {
    return String(value ?? '').replace(/[&<>"']/g, char =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] as string));
  }
}
