import { Header } from '../../common/components/Header';
import { ForeignFetchModel, ForeignLawMeta, ForeignProvision } from '../../foreign/models/ForeignFetchModel';
import {
  ChangeType,
  PsdLawCode,
  PsdTransitionFetchModel,
  TransitionArticleAnalysis,
  TransitionCatalog,
  TransitionTheme,
  TransitionViewData,
} from '../models/PsdTransitionFetchModel';
import { PsdTransitionView, TransitionLanguageMode, TransitionRenderState, TransitionViewMode } from '../views/PsdTransitionView';
import { ToastManager } from '../../common/components/ToastManager';
import { exportViewAsHtml } from '../../common/util/StaticHtmlExporter';

// URL ?code= 검증용 전체 집합(버전 무관). 실제 노출 법은 catalog.laws 가 버전별로 내려준다.
const CODES: PsdLawCode[] = ['eu_psd2', 'eu_emd2', 'eu_psd3', 'eu_psr', 'eu_psd3_2026', 'eu_psr_2026'];

/** 정적 HTML 내보내기 시 사본에서 걷어낼 조작·내비 UI(탭·툴바·필터·백링크·비교/검수 버튼). */
const TRANSITION_EXPORT_REMOVE = [
  '.pta-back',
  '.pta-tabs',
  '.pta-toolbar',
  '.pta-filters',
  '.pta-edit', '.pta-compare-all',
  '.pta-article-head a', // 조 헤더의 '본문' 외부이동 링크
];

export class PsdTransitionController {
  private transitionModel = new PsdTransitionFetchModel();
  private foreignModel = new ForeignFetchModel();
  private view = new PsdTransitionView();
  private header = new Header();
  private toast = new ToastManager();
  private catalog: TransitionCatalog | null = null;
  private code: PsdLawCode = 'eu_psd2';
  private meta: ForeignLawMeta | null = null;
  private provisions: ForeignProvision[] = [];
  private transition: TransitionViewData | null = null;
  private state: TransitionRenderState = { outcome: 'all', status: 'all', search: '', language: 'ko', viewMode: 'detail' };
  private mode: 'summary' | 'law' = 'law';
  private themes: TransitionTheme[] | null = null;
  private searchTimer: number | null = null;
  private editingArticle = '';
  private modal: any = null;
  private compareModal: any = null;
  /** 비교 팝업이 상대 법 본문을 가져오므로 법별 조문 캐시(법 4개뿐이라 메모리 무해). */
  private provisionCache = new Map<PsdLawCode, ForeignProvision[]>();

  async initialize(): Promise<void> {
    const header = document.getElementById('header');
    if (header) {
      header.innerHTML = this.header.render('foreign');
      this.header.setInfoButtonHandler();
    }
    const params = new URLSearchParams(location.search);
    const requested = params.get('code') as PsdLawCode | null;
    if (requested && CODES.includes(requested)) this.code = requested;
    this.bindEvents();

    document.getElementById('ptaExportBtn')?.addEventListener('click', () => this.exportCurrent());

    // ?tv= (transition version) — 기준 문안(최초본/잠정본) 지정. 없으면 백엔드 기본(잠정본).
    this.catalog = await this.transitionModel.getCatalog(params.get('tv') || undefined);
    if (!this.catalog) {
      document.getElementById('transitionApp')!.innerHTML = this.view.renderError('이행분석 기준정보를 불러오지 못했습니다.');
      return;
    }
    if (!this.catalog.unlocked) {
      this.renderFrame(this.view.renderLocked());
      return;
    }
    // 요약(무엇이 바뀌었나)을 기본 진입으로 — 단, 특정 법(code)이나 view=law 를 명시하면 조문뷰.
    const wantSummary = params.get('view') === 'summary'
      || (!requested && params.get('view') !== 'law' && this.catalog.themeCount > 0);
    if (wantSummary) await this.loadSummary(false);
    else await this.loadLaw(this.code, location.hash.replace(/^#/, ''), false);
  }

  private bindEvents(): void {
    const app = document.getElementById('transitionApp')!;
    app.addEventListener('click', event => {
      const target = event.target as HTMLElement;
      const summaryTab = target.closest<HTMLElement>('[data-summary]');
      if (summaryTab) {
        event.preventDefault();
        if (this.mode !== 'summary') this.loadSummary(true);
        return;
      }
      // 요약표의 근거 조문 링크 = 해당 법 조문뷰로 이동(스크롤). Ctrl/가운데클릭은 새 탭 허용.
      const themeLink = target.closest<HTMLElement>('.pta-theme-link');
      if (themeLink?.dataset.code) {
        const e = event as MouseEvent;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
        event.preventDefault();
        this.loadLaw(themeLink.dataset.code as PsdLawCode, `pta-${(themeLink.dataset.article || '').replace(/[^a-zA-Z0-9]/g, '_')}`, true);
        return;
      }
      const tab = target.closest<HTMLElement>('.pta-law-tab');
      if (tab?.dataset.code) {
        event.preventDefault();
        this.loadLaw(tab.dataset.code as PsdLawCode, '', true);
        return;
      }
      // 대응조문 칩 = 비교 팝업(이동 아님). Ctrl/Cmd·가운데클릭은 새 탭 이동을 그대로 허용.
      const counterpart = target.closest<HTMLElement>('.pta-counterpart');
      if (counterpart?.dataset.code) {
        const e = event as MouseEvent;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
        event.preventDefault();
        this.openCompare(counterpart.dataset.compareSelf || '', [counterpart.dataset.code as PsdLawCode]);
        return;
      }
      const compareAll = target.closest<HTMLElement>('.pta-compare-all');
      if (compareAll?.dataset.compareSelf) {
        event.preventDefault();
        this.openCompare(compareAll.dataset.compareSelf, null);
        return;
      }
      const chip = target.closest<HTMLElement>('.pta-chip');
      if (chip && !(chip as HTMLButtonElement).disabled && chip.dataset.dim) {
        const dim = chip.dataset.dim as 'outcome' | 'status';
        // 같은 칩을 다시 누르면 해제(토글). '전체'(value=all) 는 그 축을 초기화.
        const next = chip.dataset.value!;
        (this.state as any)[dim] = (this.state as any)[dim] === next && next !== 'all' ? 'all' : next;
        // 결과(outcome)는 '이행 세부' 하위 행의 노출 여부를 바꾸므로 툴바째 다시 그린다.
        // 상태(status) 칩은 행 구성이 그대로라 active 표시만 동기화하면 된다.
        if (dim === 'outcome' && this.meta && this.transition) {
          this.renderFrame(this.view.renderArticles(this.meta, this.provisions, this.transition, this.state));
        } else {
          this.syncChips(app);
          this.renderArticles();
        }
        return;
      }
      const language = target.closest<HTMLElement>('[data-language]');
      if (language?.dataset.language) {
        this.state.language = language.dataset.language as TransitionLanguageMode;
        app.querySelectorAll('[data-language]').forEach(el => el.classList.toggle('active', el === language));
        this.renderArticles();
        return;
      }
      const viewMode = target.closest<HTMLElement>('[data-viewmode]');
      if (viewMode?.dataset.viewmode) {
        this.state.viewMode = viewMode.dataset.viewmode as TransitionViewMode;
        // 표↔상세 전환은 툴바 자체(언어 토글 노출 여부)가 달라지므로 본문만이 아니라 틀째 다시 그린다.
        if (this.meta && this.transition) {
          this.renderFrame(this.view.renderArticles(this.meta, this.provisions, this.transition, this.state));
        }
        return;
      }
      const edit = target.closest<HTMLElement>('[data-edit-article]');
      if (edit?.dataset.editArticle) this.openEditor(edit.dataset.editArticle);
    });
    app.addEventListener('input', event => {
      const target = event.target as HTMLInputElement;
      if (target.id !== 'ptaSearch') return;
      this.state.search = target.value;
      if (this.searchTimer != null) window.clearTimeout(this.searchTimer);
      this.searchTimer = window.setTimeout(() => this.renderArticles(), 160);
    });
    app.addEventListener('change', event => {
      const target = event.target as HTMLElement;
      if (target.id === 'ptaVersionSelect') this.switchVersion((target as HTMLSelectElement).value);
    });
    document.getElementById('ptaAssessmentSave')?.addEventListener('click', () => this.saveAssessment());
    window.addEventListener('popstate', () => {
      const params = new URLSearchParams(location.search);
      const tv = params.get('tv');
      // 버전 전환 뒤로/앞으로 — 먼저 popped URL 의 뷰(요약/법)로 mode 를 맞춘 뒤 버전 교체.
      if (this.catalog && tv && tv !== this.catalog.version.code) {
        this.mode = params.get('view') === 'summary' ? 'summary' : 'law';
        this.switchVersion(tv);
        return;
      }
      if (params.get('view') === 'summary') {
        if (this.mode !== 'summary') this.loadSummary(false);
        return;
      }
      const next = params.get('code') as PsdLawCode | null;
      if (next && CODES.includes(next) && (next !== this.code || this.mode !== 'law')) {
        this.loadLaw(next, location.hash.replace(/^#/, ''), false);
      }
    });
  }

  /** 현재 버전을 URL 에 실을 쿼리 조각(&tv=…). 상태 보존·공유용. */
  private tvParam(): string {
    const code = this.catalog?.version.code;
    return code ? `&tv=${encodeURIComponent(code)}` : '';
  }

  /** 버전 전환 시 현재 보던 법을 새 버전의 대응 법으로 매핑(없으면 첫 법). eu_psr↔eu_psr_2026. */
  private mapCode(code: PsdLawCode, catalog: TransitionCatalog): PsdLawCode {
    if (catalog.laws.some(l => l.code === code)) return code;
    const alt = (code.endsWith('_2026') ? code.replace('_2026', '') : `${code}_2026`) as PsdLawCode;
    if (catalog.laws.some(l => l.code === alt)) return alt;
    return catalog.laws[0]?.code || code;
  }

  /** 기준 문안(최초본/잠정본) 전환 — catalog 재조회 후 보던 맥락(요약/법)을 새 버전으로 이어 렌더. */
  private async switchVersion(versionCode: string): Promise<void> {
    if (!this.catalog || versionCode === this.catalog.version.code) return;
    const next = await this.transitionModel.getCatalog(versionCode);
    if (!next) { this.toast.showToast('해당 기준 문안을 불러오지 못했습니다.'); return; }
    this.catalog = next;
    this.themes = null;                 // 테마는 버전별 → 캐시 무효화
    this.provisionCache.clear();        // 조문 캐시도 버전별 법코드가 달라 무효화
    this.state = { ...this.state, outcome: 'all', status: 'all', search: '' };
    if (this.mode === 'summary' && next.themeCount > 0) await this.loadSummary(false);
    else await this.loadLaw(this.mapCode(this.code, next), '', false);
  }

  /** 요약 탭 — 정밀 대사를 주제로 종합한 '무엇이 바뀌었나'. 조문뷰와 독립. */
  private async loadSummary(pushHistory = true): Promise<void> {
    if (!this.catalog) return;
    this.mode = 'summary';
    this.renderFrame(this.view.renderLoading());
    if (!this.themes) {
      const data = await this.transitionModel.getThemes(this.catalog.version.code);
      this.themes = data?.themes || [];
    }
    this.renderFrame(this.view.renderThemes(this.themes));
    this.setExportVisible(true);
    const url = `foreign-transition.html?view=summary${this.tvParam()}`;
    if (pushHistory) history.pushState(null, '', url); else history.replaceState(null, '', url);
    window.scrollTo({ top: 0 });
  }

  private async loadLaw(code: PsdLawCode, anchor = '', pushHistory = true): Promise<void> {
    if (!this.catalog) return;
    // 법을 바꾸면 결과 필터를 초기화한다 — 법마다 결과 분포가 완전히 달라(현행법은 '신설' 0건,
    // 예정법은 '이행없음' 0건) 필터를 유지하면 새 법에서 0건이 되어 빈 화면처럼 보인다.
    // 표시 취향(언어·상세/표)은 유지한다. 검색어도 법이 바뀌면 맥락이 달라지므로 비운다.
    if (code !== this.code) {
      this.state.outcome = 'all';
      this.state.status = 'all';
      this.state.search = '';
    }
    this.mode = 'law';
    this.code = code;
    this.meta = null;
    this.provisions = [];
    this.transition = null;
    this.renderFrame(this.view.renderLoading());
    const [foreign, transition] = await Promise.all([
      this.foreignModel.getProvisions(code),
      this.transitionModel.getView(code, this.catalog.version.code),
    ]);
    if (!foreign || !transition) {
      this.renderFrame(this.view.renderError('조문 또는 이행분석을 불러오지 못했습니다. 이용 권한과 서버 상태를 확인해 주세요.'));
      this.setExportVisible(false);
      return;
    }
    this.meta = foreign.meta;
    this.provisions = foreign.provisions;
    this.provisionCache.set(code, foreign.provisions); // 비교 팝업이 재요청하지 않도록 공유
    this.transition = transition;
    this.renderFrame(this.view.renderArticles(this.meta, this.provisions, this.transition, this.state));
    this.setExportVisible(true);

    const url = `foreign-transition.html?code=${encodeURIComponent(code)}${this.tvParam()}${anchor ? '#' + anchor : ''}`;
    if (pushHistory) history.pushState(null, '', url); else history.replaceState(null, '', url);
    if (anchor) this.scrollTo(anchor);
    else window.scrollTo({ top: 0 });
  }

  private renderFrame(body: string): void {
    if (!this.catalog) return;
    // 필터 칩 건수는 '현재 법 전체' 기준 → 법이 바뀔 때만 재계산(필터 변경 시엔 본문만 다시 그림).
    const counts = this.mode === 'law' && this.provisions.length && this.transition
      ? this.view.computeCounts(this.provisions, this.transition) : null;
    document.getElementById('transitionApp')!.innerHTML =
      this.view.renderFrame(this.catalog, this.code, this.state, body, counts, this.mode === 'summary');
  }

  /** 법별 조문 캐시 — 비교 팝업이 상대 법 본문을 필요로 한다. */
  private async provisionsOf(code: PsdLawCode): Promise<ForeignProvision[]> {
    const hit = this.provisionCache.get(code);
    if (hit) return hit;
    const data = await this.foreignModel.getProvisions(code);
    const list = data?.provisions || [];
    if (list.length) this.provisionCache.set(code, list);
    return list;
  }

  private segsOf(list: ForeignProvision[], articleNo: string | null): ForeignProvision[] {
    if (!articleNo) return [];
    return list.filter(p => p.article_no === articleNo);
  }

  /**
   * 전후 조문 비교 팝업. onlyCodes 가 있으면 그 법의 대응만(칩 1개 클릭),
   * null 이면 이 조의 모든 대응(‘한번에 비교’). 상대 법 본문은 캐시 fetch.
   */
  private async openCompare(selfArticleNo: string, onlyCodes: PsdLawCode[] | null): Promise<void> {
    if (!selfArticleNo || !this.meta) return;
    const analysis = this.findAnalysis(selfArticleNo);
    const element = document.getElementById('ptaCompareModal');
    const body = document.getElementById('ptaCompareBody');
    const title = document.getElementById('ptaCompareTitle');
    const BootstrapModal = (window as any).bootstrap?.Modal;
    if (!element || !body || !BootstrapModal) return;

    if (title) title.textContent = `${this.meta.abbrev || this.code} 제${selfArticleNo}조 — 전후 조문 비교`;
    body.innerHTML = this.view.renderLoading();
    this.compareModal ||= BootstrapModal.getOrCreateInstance(element);
    this.compareModal.show();

    let targets = analysis
      ? [...new Map(analysis.relations.flatMap(r => r.counterparts)
          .map(c => [`${c.lawCode}|${c.articleNo || ''}`, c])).values()]
      : [];
    if (onlyCodes) targets = targets.filter(c => onlyCodes.includes(c.lawCode));

    const others = await Promise.all(targets.map(async c => ({
      code: c.lawCode, abbrev: c.abbrev, articleNo: c.articleNo, displayRef: c.displayRef,
      segs: this.segsOf(await this.provisionsOf(c.lawCode), c.articleNo),
    })));

    body.innerHTML = this.view.renderCompare({
      selfCode: this.code, selfAbbrev: this.meta.abbrev || this.code, selfArticleNo,
      selfSegs: this.segsOf(this.provisions, selfArticleNo), analysis, others, language: this.state.language,
    });
  }

  private renderArticles(): void {
    if (!this.meta || !this.transition) return;
    const body = document.getElementById('ptaBody');
    if (body) body.innerHTML = this.view.renderArticles(this.meta, this.provisions, this.transition, this.state);
  }

  /**
   * 칩 활성표시 동기화. 툴바 전체를 다시 그리지 않고(검색 포커스·스크롤 보존) 상태값 기준으로
   * active 클래스만 맞춘다. '전체' 칩(value=all)도 data-dim 을 가지므로 같은 루프로 처리된다.
   */
  private syncChips(app: HTMLElement): void {
    const s = this.state as any;
    app.querySelectorAll<HTMLElement>('.pta-chip[data-dim]').forEach(el => {
      const on = s[el.dataset.dim!] === el.dataset.value;
      el.classList.toggle('active', on);
      el.setAttribute('aria-pressed', String(on));
    });
  }

  private scrollTo(anchor: string): void {
    const jump = () => document.getElementById(anchor)?.scrollIntoView();
    requestAnimationFrame(() => { jump(); requestAnimationFrame(jump); });
    window.setTimeout(jump, 200);
  }

  private findAnalysis(articleNo: string): TransitionArticleAnalysis | undefined {
    return this.transition?.articles.find(article => article.articleNo === articleNo);
  }

  // ── 정적 HTML 내보내기(의사결정자 전달용 이행검토 표) ─────────────────────────
  private setExportVisible(on: boolean): void {
    document.getElementById('ptaExportBtn')?.classList.toggle('d-none', !on);
  }

  /** 현재 탭(요약 / 법별 상세·요약표)을 '조회 그대로' 정적 HTML로 저장. */
  private async exportCurrent(): Promise<void> {
    const app = document.getElementById('transitionApp');
    if (!app || !this.catalog) return;
    const btn = document.getElementById('ptaExportBtn') as HTMLButtonElement | null;
    if (btn) btn.disabled = true;
    try {
      const version = this.catalog.version.labelKo;
      let scope: string;
      let titleScope: string;
      if (this.mode === 'summary') {
        scope = '요약_무엇이바뀌었나';
        titleScope = '요약(무엇이 바뀌었나)';
      } else {
        const abbr = this.meta?.abbrev || this.code;
        const mode = this.state.viewMode === 'table' ? '요약표' : '상세';
        scope = `${abbr}_${mode}`;
        titleScope = `${abbr} ${mode}`;
      }
      await exportViewAsHtml({
        source: app,
        title: `PSD 이행분석 — ${titleScope}`,
        filename: `PSD이행분석_${scope}`,
        removeSelectors: TRANSITION_EXPORT_REMOVE,
        footnote: `이 문서는 LawQuery의 PSD 이행분석 화면을 정적 파일로 내보낸 참고자료입니다. `
          + `${version} 기준이며, 번역·분석은 참고용입니다. 법적 효력은 원문에 있습니다. `
          + `내보낸 날짜: ${new Date().toISOString().slice(0, 10)}.`,
      });
      this.toast.showToast('HTML 파일로 저장했습니다');
    } catch (e) {
      console.error('export 실패', e);
      this.toast.showToast('저장에 실패했습니다');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  private openEditor(articleNo: string): void {
    const analysis = this.findAnalysis(articleNo);
    if (!analysis || !this.transition?.editable) return;
    this.editingArticle = articleNo;
    const title = document.getElementById('ptaAssessmentTitle');
    const type = document.getElementById('ptaAssessmentType') as HTMLSelectElement | null;
    const summary = document.getElementById('ptaAssessmentSummary') as HTMLTextAreaElement | null;
    const detail = document.getElementById('ptaAssessmentDetail') as HTMLTextAreaElement | null;
    if (title) title.textContent = `${this.meta?.abbrev || this.code} 제${articleNo}조 분석 검수`;
    if (type) type.value = analysis.assessment.changeType;
    if (summary) summary.value = analysis.assessment.summaryKo;
    if (detail) detail.value = analysis.assessment.detailKo;
    const element = document.getElementById('ptaAssessmentModal');
    const BootstrapModal = (window as any).bootstrap?.Modal;
    if (element && BootstrapModal) {
      this.modal ||= BootstrapModal.getOrCreateInstance(element);
      this.modal.show();
    }
  }

  private async saveAssessment(): Promise<void> {
    const analysis = this.findAnalysis(this.editingArticle);
    if (!analysis || !this.transition || !this.catalog) return;
    const type = (document.getElementById('ptaAssessmentType') as HTMLSelectElement).value as ChangeType;
    const summary = (document.getElementById('ptaAssessmentSummary') as HTMLTextAreaElement).value.trim();
    const detail = (document.getElementById('ptaAssessmentDetail') as HTMLTextAreaElement).value.trim();
    const button = document.getElementById('ptaAssessmentSave') as HTMLButtonElement;
    if (!summary) {
      (document.getElementById('ptaAssessmentSummary') as HTMLTextAreaElement).focus();
      return;
    }
    button.disabled = true;
    button.textContent = '저장 중…';
    const ok = await this.transitionModel.saveAssessment({
      version: this.catalog.version.code, code: this.code, articleNo: this.editingArticle,
      changeType: type, summaryKo: summary, detailKo: detail,
    });
    button.disabled = false;
    button.textContent = '검수 완료로 저장';
    if (!ok) {
      window.alert('분석을 저장하지 못했습니다.');
      return;
    }
    analysis.assessment.changeType = type;
    analysis.assessment.summaryKo = summary;
    analysis.assessment.detailKo = detail;
    analysis.assessment.reviewStatus = 'reviewed';
    this.modal?.hide();
    this.renderArticles();
    this.scrollTo(`pta-${this.editingArticle}`);
  }
}
