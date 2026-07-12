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
  private state: TransitionRenderState = { filter: 'all', search: '', language: 'ko' };
  private searchTimer: number | null = null;
  private editingArticle = '';
  private modal: any = null;

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
      const counterpart = target.closest<HTMLElement>('.pta-counterpart');
      if (counterpart?.dataset.code) {
        event.preventDefault();
        this.loadLaw(counterpart.dataset.code as PsdLawCode, counterpart.dataset.anchor || '', true);
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
    app.addEventListener('change', event => {
      const target = event.target as HTMLInputElement | HTMLSelectElement;
      if (target.id === 'ptaFilter') {
        this.state.filter = target.value;
        this.renderArticles();
      }
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
    this.transition = transition;
    this.renderFrame(this.view.renderArticles(this.meta, this.provisions, this.transition, this.state));

    const url = `foreign-transition.html?code=${encodeURIComponent(code)}${anchor ? '#' + anchor : ''}`;
    if (pushHistory) history.pushState(null, '', url); else history.replaceState(null, '', url);
    if (anchor) this.scrollTo(anchor);
    else window.scrollTo({ top: 0 });
  }

  private renderFrame(body: string): void {
    if (!this.catalog) return;
    document.getElementById('transitionApp')!.innerHTML = this.view.renderFrame(this.catalog, this.code, this.state, body);
  }

  private renderArticles(): void {
    if (!this.meta || !this.transition) return;
    const body = document.getElementById('ptaBody');
    if (body) body.innerHTML = this.view.renderArticles(this.meta, this.provisions, this.transition, this.state);
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
