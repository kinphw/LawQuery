import { Header } from '../../common/components/Header';
import { ForeignFetchModel, ForeignLawMeta, ForeignProvision } from '../../foreign/models/ForeignFetchModel';
import {
  ChangeType,
  PsdLawCode,
  PsdTransitionFetchModel,
  TransitionArticleAnalysis,
  TransitionCatalog,
  TransitionViewData,
} from '../models/PsdTransitionFetchModel';
import { PsdTransitionView, TransitionLanguageMode, TransitionRenderState } from '../views/PsdTransitionView';

const CODES: PsdLawCode[] = ['eu_psd2', 'eu_emd2', 'eu_psd3', 'eu_psr'];

export class PsdTransitionController {
  private transitionModel = new PsdTransitionFetchModel();
  private foreignModel = new ForeignFetchModel();
  private view = new PsdTransitionView();
  private header = new Header();
  private catalog: TransitionCatalog | null = null;
  private code: PsdLawCode = 'eu_psd2';
  private meta: ForeignLawMeta | null = null;
  private provisions: ForeignProvision[] = [];
  private transition: TransitionViewData | null = null;
  private state: TransitionRenderState = { structural: 'all', change: 'all', status: 'all', search: '', language: 'ko' };
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
    const requested = new URLSearchParams(location.search).get('code') as PsdLawCode | null;
    if (requested && CODES.includes(requested)) this.code = requested;
    this.bindEvents();

    this.catalog = await this.transitionModel.getCatalog();
    if (!this.catalog) {
      document.getElementById('transitionApp')!.innerHTML = this.view.renderError('이행분석 기준정보를 불러오지 못했습니다.');
      return;
    }
    if (!this.catalog.unlocked) {
      this.renderFrame(this.view.renderLocked());
      return;
    }
    await this.loadLaw(this.code, location.hash.replace(/^#/, ''), false);
  }

  private bindEvents(): void {
    const app = document.getElementById('transitionApp')!;
    app.addEventListener('click', event => {
      const target = event.target as HTMLElement;
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
      if (chip && !(chip as HTMLButtonElement).disabled) {
        if (chip.dataset.reset) {                       // '전체' = 3차원 모두 해제
          this.state.structural = 'all'; this.state.change = 'all'; this.state.status = 'all';
        } else if (chip.dataset.dim) {
          const dim = chip.dataset.dim as 'structural' | 'change' | 'status';
          // 같은 칩을 다시 누르면 해제(토글) — 단축칩으로 켜고 끄기가 자연스럽다.
          const next = chip.dataset.value!;
          (this.state as any)[dim] = (this.state as any)[dim] === next && next !== 'all' ? 'all' : next;
        } else return;
        this.syncChips(app);
        this.renderArticles();
        return;
      }
      const language = target.closest<HTMLElement>('[data-language]');
      if (language?.dataset.language) {
        this.state.language = language.dataset.language as TransitionLanguageMode;
        app.querySelectorAll('[data-language]').forEach(el => el.classList.toggle('active', el === language));
        this.renderArticles();
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
    document.getElementById('ptaAssessmentSave')?.addEventListener('click', () => this.saveAssessment());
    window.addEventListener('popstate', () => {
      const next = new URLSearchParams(location.search).get('code') as PsdLawCode | null;
      if (next && CODES.includes(next) && next !== this.code) this.loadLaw(next, location.hash.replace(/^#/, ''), false);
    });
  }

  private async loadLaw(code: PsdLawCode, anchor = '', pushHistory = true): Promise<void> {
    if (!this.catalog) return;
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
      return;
    }
    this.meta = foreign.meta;
    this.provisions = foreign.provisions;
    this.provisionCache.set(code, foreign.provisions); // 비교 팝업이 재요청하지 않도록 공유
    this.transition = transition;
    this.renderFrame(this.view.renderArticles(this.meta, this.provisions, this.transition, this.state));

    const url = `foreign-transition.html?code=${encodeURIComponent(code)}${anchor ? '#' + anchor : ''}`;
    if (pushHistory) history.pushState(null, '', url); else history.replaceState(null, '', url);
    if (anchor) this.scrollTo(anchor);
    else window.scrollTo({ top: 0 });
  }

  private renderFrame(body: string): void {
    if (!this.catalog) return;
    // 필터 칩 건수는 '현재 법 전체' 기준 → 법이 바뀔 때만 재계산(필터 변경 시엔 본문만 다시 그림).
    const counts = this.provisions.length && this.transition
      ? this.view.computeCounts(this.provisions, this.transition) : null;
    document.getElementById('transitionApp')!.innerHTML =
      this.view.renderFrame(this.catalog, this.code, this.state, body, counts);
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
   * 칩 활성표시 동기화. 같은 값의 칩이 단축줄과 '상세'에 모두 있으므로 클릭한 요소가 아니라
   * 상태값 기준으로 맞춰야 짝이 어긋나지 않는다(툴바를 통째로 다시 그리면 '상세' 펼침이 닫힌다).
   */
  private syncChips(app: HTMLElement): void {
    const s = this.state as any;
    app.querySelectorAll<HTMLElement>('.pta-chip[data-dim]').forEach(el => {
      const on = s[el.dataset.dim!] === el.dataset.value;
      el.classList.toggle('active', on);
      el.setAttribute('aria-pressed', String(on));
    });
    const reset = app.querySelector<HTMLElement>('.pta-chip[data-reset]');
    if (reset) {
      const none = this.state.structural === 'all' && this.state.change === 'all' && this.state.status === 'all';
      reset.classList.toggle('active', none);
      reset.setAttribute('aria-pressed', String(none));
    }
  }

  private scrollTo(anchor: string): void {
    const jump = () => document.getElementById(anchor)?.scrollIntoView();
    requestAnimationFrame(() => { jump(); requestAnimationFrame(jump); });
    window.setTimeout(jump, 200);
  }

  private findAnalysis(articleNo: string): TransitionArticleAnalysis | undefined {
    return this.transition?.articles.find(article => article.articleNo === articleNo);
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
