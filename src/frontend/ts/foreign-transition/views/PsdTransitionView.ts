import { ForeignLawMeta, ForeignProvision } from '../../foreign/models/ForeignFetchModel';
import {
  ChangeType,
  PsdLawCode,
  ReviewStatus,
  StructuralType,
  TransitionArticleAnalysis,
  TransitionCatalog,
  TransitionCounterpart,
  TransitionRelation,
  TransitionViewData,
} from '../models/PsdTransitionFetchModel';

export type TransitionLanguageMode = 'ko' | 'original' | 'both';
export interface TransitionRenderState {
  filter: string;
  search: string;
  language: TransitionLanguageMode;
}

const STRUCTURAL_LABELS: Record<StructuralType, string> = {
  one_to_one: '1:1 이행', split: '분할 이행', merge: '통합 이행', many_to_many: '다대다 이행',
  new: '신설', deleted: '이행 없음', pending: '대응 검토중',
};
const CHANGE_LABELS: Record<ChangeType, string> = {
  maintained: '유지', clarified: '명확화', strengthened: '강화', relaxed: '완화',
  material_change: '실질변경', pending: '내용 검토중',
};

export class PsdTransitionView {
  renderFrame(catalog: TransitionCatalog, current: PsdLawCode, state: TransitionRenderState, body: string): string {
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
          <strong>${this.esc(catalog.version.labelKo)}</strong>
          <span>${this.esc(catalog.version.basisKo)}</span>
          <div class="pta-source-links">${sources}</div>
        </div>
      </section>
      <div class="pta-notice"><i class="fas fa-circle-info"></i> ${this.esc(catalog.version.noticeKo)}
        ${catalog.conflictCount ? `<span class="pta-conflict-count">상관표 불일치 ${catalog.conflictCount}건</span>` : ''}
      </div>
      ${this.tabs(catalog, current)}
      ${catalog.unlocked ? this.toolbar(state, selected?.articleCount || 0) : ''}
      <main id="ptaBody">${body}</main>
    </div>`;
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
      if (!/^\d+$/.test(provision.article_no)) continue;
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

    for (const item of articles) html += this.article(item.articleNo, item.segs, item.analysis, state.language, transition.editable, meta.code as PsdLawCode);
    return html;
  }

  private tabs(catalog: TransitionCatalog, current: PsdLawCode): string {
    const renderGroup = (side: 'current' | 'future', label: string) => {
      const laws = catalog.laws.filter(l => l.side === side);
      return `<div class="pta-tab-group"><span class="pta-tab-label">${label}</span>${laws.map(l => {
        const active = l.code === current ? ' active' : '';
        const secondary = side === 'current'
          ? `${l.mappedCount} 이행 · ${l.deletedCount} 이행없음`
          : `${l.mappedCount} 이행 · ${l.newCount} 신설`;
        return `<button type="button" class="pta-law-tab${active}" data-code="${l.code}">
          <strong>${this.esc(l.abbrev)}</strong><small>${secondary}</small></button>`;
      }).join('')}</div>`;
    };
    return `<nav class="pta-tabs" aria-label="PSD 법령 선택">${renderGroup('current', '현행 규정')}${renderGroup('future', '예정 규정')}</nav>`;
  }

  private toolbar(state: TransitionRenderState, total: number): string {
    const options: Array<[string, string]> = [
      ['all', '전체 상태'], ['maintained', '유지'], ['clarified', '명확화'], ['strengthened', '강화'],
      ['relaxed', '완화'], ['material_change', '실질변경'], ['new', '신설'], ['deleted', '이행 없음'],
      ['conflict', '상관표 불일치'], ['pending', '검토중'], ['reviewed', '검수완료'],
    ];
    const modes: Array<[TransitionLanguageMode, string]> = [['ko', '한국어'], ['original', '원문'], ['both', '한·영']];
    return `<div class="pta-toolbar">
      <label class="pta-search"><i class="fas fa-search"></i><input id="ptaSearch" type="search"
        value="${this.esc(state.search)}" placeholder="조문 제목·본문·분석 검색" aria-label="이행분석 검색"></label>
      <select id="ptaFilter" class="form-select form-select-sm" aria-label="상태 필터">
        ${options.map(([value, label]) => `<option value="${value}"${state.filter === value ? ' selected' : ''}>${label}</option>`).join('')}
      </select>
      <div class="pta-language" role="group" aria-label="본문 언어">
        ${modes.map(([value, label]) => `<button type="button" data-language="${value}" class="${state.language === value ? 'active' : ''}">${label}</button>`).join('')}
      </div>
      <span class="pta-total">전체 ${total}개 조문</span>
    </div>`;
  }

  private matches(segs: ForeignProvision[], analysis: TransitionArticleAnalysis | undefined, state: TransitionRenderState): boolean {
    if (!analysis) return state.filter === 'all' || state.filter === 'pending';
    const filter = state.filter;
    if (filter !== 'all') {
      if (filter === 'new' || filter === 'deleted') {
        if (analysis.assessment.structuralType !== filter) return false;
      } else if (filter === 'conflict') {
        if (!analysis.relations.some(r => r.evidenceStatus === 'conflict')) return false;
      } else if (filter === 'reviewed') {
        if (analysis.assessment.reviewStatus !== 'reviewed') return false;
      } else if (filter === 'pending') {
        if (analysis.assessment.changeType !== 'pending' && analysis.assessment.structuralType !== 'pending') return false;
      } else if (analysis.assessment.changeType !== filter) return false;
    }
    const q = state.search.trim().toLocaleLowerCase();
    if (!q) return true;
    const haystack = [analysis.articleNo, analysis.assessment.summaryKo, analysis.assessment.detailKo,
      ...segs.flatMap(s => [s.heading || '', s.heading_ko || '', s.text_original || '', s.text_ko || ''])].join(' ').toLocaleLowerCase();
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
    if (language === 'both') return `<div class="pta-bilingual">${column('ko')}${column('original')}</div>`;
    return column(language === 'ko' ? 'ko' : 'original');
  }

  private analysis(articleNo: string, analysis: TransitionArticleAnalysis | undefined, editable: boolean, lawCode: PsdLawCode): string {
    if (!analysis) return '<div class="pta-pending">분석 데이터 준비중</div>';
    const a = analysis.assessment;
    const auto = a.reviewStatus === 'automatic';
    const changeLabel = auto && a.changeType !== 'pending' ? `${CHANGE_LABELS[a.changeType]} 가능성` : CHANGE_LABELS[a.changeType];
    const counterparts = this.uniqueCounterparts(analysis.relations);
    const conflict = analysis.relations.some(r => r.evidenceStatus === 'conflict');
    const chips = counterparts.length
      ? `<div class="pta-counterparts">${counterparts.map(c => this.counterpartChip(c)).join('')}</div>`
      : `<div class="pta-no-counterpart">${a.structuralType === 'new' ? '선행 조문 없음' : a.structuralType === 'deleted' ? '후속 조문 없음' : '대응 조문 확인중'}</div>`;
    return `<div class="pta-badges">
        <span class="pta-badge structural ${a.structuralType}">${STRUCTURAL_LABELS[a.structuralType]}</span>
        <span class="pta-badge change ${a.changeType}">${this.esc(changeLabel)}</span>
        <span class="pta-review ${a.reviewStatus}">${a.reviewStatus === 'reviewed' ? '검수완료' : '자동초안'}</span>
      </div>
      ${chips}
      <p class="pta-summary">${this.esc(a.summaryKo)}</p>
      ${a.detailKo ? `<p class="pta-detail">${this.esc(a.detailKo)}</p>` : ''}
      ${a.similarityPct != null ? `<div class="pta-similarity"><span>영문 문언 유사도</span><strong>${Math.round(a.similarityPct)}%</strong><div><i style="width:${Math.max(2, Math.min(100, a.similarityPct))}%"></i></div></div>` : ''}
      ${conflict ? '<div class="pta-conflict"><i class="fas fa-triangle-exclamation"></i> PSD3·PSR Annex III의 대응표가 서로 다릅니다.</div>' : ''}
      ${this.evidence(analysis.relations)}
      ${editable ? `<button type="button" class="pta-edit" data-edit-article="${this.esc(articleNo)}" data-law-code="${lawCode}"><i class="fas fa-pen"></i> 분석 검수</button>` : ''}`;
  }

  private uniqueCounterparts(relations: TransitionRelation[]): TransitionCounterpart[] {
    const map = new Map<string, TransitionCounterpart>();
    for (const relation of relations) for (const c of relation.counterparts) {
      map.set(`${c.lawCode}|${c.articleNo || ''}`, c);
    }
    return [...map.values()];
  }

  private counterpartChip(c: TransitionCounterpart): string {
    const label = c.articleNo ? `${c.abbrev} 제${c.articleNo}조` : `${c.abbrev} ${c.displayRef}`;
    const anchor = c.articleNo ? `pta-${this.anchor(c.articleNo)}` : '';
    return `<a class="pta-counterpart" href="foreign-transition.html?code=${c.lawCode}${anchor ? '#' + anchor : ''}"
      data-code="${c.lawCode}" data-anchor="${anchor}" title="${this.esc(c.displayRef)}">${this.esc(label)} <i class="fas fa-arrow-right"></i></a>`;
  }

  private evidence(relations: TransitionRelation[]): string {
    if (!relations.length) return '';
    const rows = relations.map(r => {
      const evidence = r.evidenceStatus === 'both' ? '양쪽 Annex III 일치'
        : r.evidenceStatus === 'conflict' ? 'Annex III 불일치'
        : r.evidenceStatus === 'psd3_annex' ? 'PSD3 Annex III' : 'PSR Annex III';
      const target = r.counterparts.length ? r.counterparts.map(c => this.esc(c.displayRef)).join(' · ') : '대응 없음';
      return `<div class="pta-evidence-row"><span class="${r.evidenceStatus}">${evidence}</span>
        <div><strong>${r.selfRefs.map(x => this.esc(x)).join(' · ')}</strong><i class="fas fa-arrow-right"></i>${target}</div>
        ${r.conflictNote ? `<pre>${this.esc(r.conflictNote)}</pre>` : ''}</div>`;
    }).join('');
    return `<details class="pta-evidence"><summary>항·호 단위 공식 근거 ${relations.length}건</summary>${rows}</details>`;
  }

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
