import { Header } from '../../common/components/Header';
import { ToastManager } from '../../common/components/ToastManager';
import { LawFetchUnitModel, LawUnitRow } from '../models/LawFetchUnitModel';
import type { LawMeta } from '../models/LawFetchMetaModel';

/**
 * 무료(비회원·FREE) 단일 단위 뷰.
 *
 * 킬 기능(5단 연계표·벌칙·참조·별표·유권해석)은 PRO 전용이므로,
 * 무료 사용자에게는 "한 단(법/시행령/감독규정/세칙)을 통째로 보는" 단일뷰를 제공하고
 * 연계표/벌칙/별표 등은 잠금(가입·업그레이드 유도) 처리한다.
 *
 * 법령 페이지(index.html)의 정적 레이아웃을 재사용하되 PRO 요소는 잠그고, #results에 단일뷰를 그린다.
 */
export class LawUnitView {
  private header = new Header();
  private toast = new ToastManager();
  private model = new LawFetchUnitModel();

  private meta: LawMeta[];
  private authenticated: boolean;
  private currentOrigin = 'a';
  private currentRows: LawUnitRow[] = [];

  // /unit이 지원하는 단위(db_a/e/s/r). 5단(별표/시행세칙 b)은 PRO 연계표에서만.
  private static readonly UNIT_ORIGINS = ['a', 'e', 's', 'r'];
  private static readonly FALLBACK_LABEL: Record<string, string> = {
    a: '법', e: '시행령', s: '감독규정', r: '시행세칙',
  };

  constructor(meta: LawMeta[], authenticated: boolean) {
    this.meta = meta;
    this.authenticated = authenticated;
  }

  /** 무료 화면 구성 + 첫 단위 로드. */
  async start(): Promise<void> {
    this.renderHeader();
    this.lockProElements();
    this.renderShell();
    this.bindSelector();
    this.bindTextSearch();
    await this.loadUnit(this.currentOrigin);
  }

  private renderHeader(): void {
    const headerEl = document.getElementById('header');
    if (headerEl) {
      headerEl.innerHTML = this.header.render('law');
      this.header.setInfoButtonHandler();
    }
  }

  /** 지원 단위 목록(meta 기준, origin a/e/s/r만). */
  private units(): Array<{ origin: string; label: string }> {
    const byOrigin = new Map(this.meta.map((m) => [m.origin, m]));
    return LawUnitView.UNIT_ORIGINS
      .filter((o) => byOrigin.has(o))
      .map((o) => ({
        origin: o,
        label: byOrigin.get(o)!.short_name || LawUnitView.FALLBACK_LABEL[o] || o.toUpperCase(),
      }));
  }

  /** 단위 선택바 + 업셀 배너를 #results 위에 삽입. */
  private renderShell(): void {
    const results = document.getElementById('results');
    if (!results) return;

    const cta = this.authenticated
      ? '<span class="text-muted">PRO 등급에서 이용 가능합니다.</span>'
      : '<a href="login.html" class="btn btn-primary btn-sm">가입하고 무료로 PRO 베타 이용 →</a>';

    const buttons = this.units()
      .map(
        (u, i) =>
          `<button type="button" class="btn btn-sm ${i === 0 ? 'btn-dark' : 'btn-outline-dark'} lq-unit-btn" data-origin="${u.origin}">${u.label}</button>`
      )
      .join('');

    const host = document.createElement('div');
    host.id = 'lq-unit-host';
    host.className = 'container mb-3';
    host.innerHTML = `
      <div class="alert alert-primary d-flex flex-wrap align-items-center gap-2 py-2 mb-3">
        <span><i class="fas fa-unlock-alt"></i>
          <strong>5단 연계표·벌칙·별표·유권해석</strong>은 PRO 전용입니다.</span>
        <span class="ms-auto">${cta}</span>
      </div>
      <div class="d-flex flex-wrap align-items-center gap-2">
        <span class="text-muted small">단위 선택:</span>
        <div class="btn-group btn-group-sm" role="group" id="lq-unit-buttons">${buttons}</div>
      </div>
    `;
    results.parentElement?.insertBefore(host, results);
  }

  /** 법령 페이지의 PRO 전용 정적 요소(벌칙/별표 버튼, 조문별 선택조회)를 잠근다. */
  private lockProElements(): void {
    ['penaltyBtn', 'annexBtn'].forEach((id) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.classList.add('disabled');
      btn.setAttribute('title', 'PRO 전용 기능입니다.');
      btn.innerHTML += ' <i class="fas fa-lock"></i>';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.showUpsell();
      });
    });

    // 조문별 선택조회(연계표 = PRO) → 잠금 안내로 교체
    const checkboxes = document.getElementById('lawCheckboxes');
    if (checkboxes) {
      checkboxes.innerHTML =
        '<div class="p-3 text-muted small"><i class="fas fa-lock"></i> ' +
        '조문별 연계표는 PRO 전용입니다.</div>';
    }
  }

  private bindSelector(): void {
    document.getElementById('lq-unit-buttons')?.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('.lq-unit-btn') as HTMLElement | null;
      if (!btn) return;
      const origin = btn.dataset.origin!;
      document.querySelectorAll('.lq-unit-btn').forEach((b) => {
        b.classList.toggle('btn-dark', b === btn);
        b.classList.toggle('btn-outline-dark', b !== btn);
      });
      this.loadUnit(origin);
    });
  }

  private bindTextSearch(): void {
    const input = document.getElementById('lawTextSearch') as HTMLInputElement | null;
    const btn = document.getElementById('lawTextSearchBtn');
    const run = () => this.renderRows(input?.value.trim() || '');
    btn?.addEventListener('click', run);
    input?.addEventListener('keypress', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') { e.preventDefault(); run(); }
    });
  }

  private async loadUnit(origin: string): Promise<void> {
    this.currentOrigin = origin;
    const results = document.getElementById('results');
    if (results) results.innerHTML =
      '<div class="text-center p-4"><div class="spinner-border text-secondary" role="status"></div></div>';
    this.currentRows = await this.model.getUnit(origin);
    const input = document.getElementById('lawTextSearch') as HTMLInputElement | null;
    this.renderRows(input?.value.trim() || '');
    this.toast.showToast(`${this.unitLabel(origin)} ${this.currentRows.length}개 조문`);
  }

  private unitLabel(origin: string): string {
    return this.units().find((u) => u.origin === origin)?.label
      || LawUnitView.FALLBACK_LABEL[origin] || origin;
  }

  /** 단일 단위 본문을 #results에 단일 컬럼으로 렌더(검색어 하이라이트·필터 포함). */
  private renderRows(search: string): void {
    const results = document.getElementById('results');
    if (!results) return;

    let rows = this.currentRows;
    if (search) {
      rows = rows.filter(
        (r) =>
          (r.content && r.content.includes(search)) ||
          (r.title && r.title.includes(search)) ||
          (r.content_sched && r.content_sched.includes(search))
      );
    }

    if (!rows.length) {
      results.innerHTML = `<div class="container"><div class="alert alert-warning">${search ? '검색 결과가 없습니다.' : '표시할 내용이 없습니다.'}</div></div>`;
      return;
    }

    const fullName = this.meta.find((m) => m.origin === this.currentOrigin)?.full_name || '';
    const head = fullName
      ? `<div class="text-center my-3"><span class="badge bg-dark fs-6">${this.esc(fullName.split('\n')[0])}</span></div>`
      : '';

    const body = rows.map((r) => this.renderRow(r, search)).join('');
    results.innerHTML = `<div class="container"><div class="law-unit-list">${head}${body}</div></div>`;
  }

  private renderRow(r: LawUnitRow, search: string): string {
    // 법(db_a)의 제목행(content 없이 title만) → 장/절 제목으로
    if (r.title && !r.content) {
      return `<h5 class="law-unit-title mt-4 mb-2">${this.hl(r.title, search)}</h5>`;
    }
    const parts: string[] = [];
    if (r.content) {
      parts.push(
        `<div class="card mb-2"><div class="card-body p-2 small">${this.hl(r.content, search)}</div></div>`
      );
    }
    if (r.content_sched) {
      const label = r.sched_date ? `시행예정 ${this.esc(r.sched_date)}` : '시행예정';
      parts.push(
        `<div class="card mb-2 border-info"><div class="card-header py-1 small text-info">${label}</div>` +
        `<div class="card-body p-2 small">${this.hl(r.content_sched, search)}</div></div>`
      );
    }
    return parts.join('');
  }

  private showUpsell(): void {
    const msg = this.authenticated
      ? 'PRO 전용 기능입니다. 관리자에게 PRO 전환을 문의해 주세요.'
      : '가입하면 PRO 기능을 베타 기간 무료로 이용하실 수 있습니다.';
    this.toast.showToast(msg);
    if (!this.authenticated) {
      setTimeout(() => { location.href = 'login.html'; }, 1200);
    }
  }

  // \n→<br> + 검색어 하이라이트(이스케이프 후)
  private hl(text: string, search: string): string {
    let s = this.esc(text);
    if (search) {
      const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      s = s.replace(new RegExp(safe, 'gi'), (m) => `<span class="text-danger fw-bold">${m}</span>`);
    }
    return s.replace(/\n/g, '<br>');
  }

  private esc(s: string): string {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
    );
  }
}
