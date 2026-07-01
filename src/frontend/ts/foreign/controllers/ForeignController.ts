import { ForeignFetchModel, ForeignLawListItem, ForeignProvision, ForeignLawMeta } from '../models/ForeignFetchModel';
import { ForeignView } from '../views/ForeignView';
import { ForeignOverviewView } from '../views/ForeignOverviewView';
import { Header } from '../../common/components/Header';

/**
 * 해외법령 컨트롤러. 드롭다운으로 법령 선택 → 원문/번역 2단 표 + 메모(PRO).
 * plan 분기는 auth-gate.js 가 노출한 window.__lqMePromise 를 재사용(중복 fetch 방지).
 */
const JURIS_ORDER = ['eu', 'us', 'jp', 'hk', 'sg', 'other'];
const JURIS_LABEL: Record<string, string> = {
  eu: '유럽연합(EU)', us: '미국', jp: '일본', hk: '홍콩', sg: '싱가포르', other: '기타',
};

export class ForeignController {
  private model = new ForeignFetchModel();
  private view = new ForeignView();
  private overview = new ForeignOverviewView();
  private header = new Header();
  private laws: ForeignLawListItem[] = [];
  private currentCode = '';
  private canEditMemo = false; // 운영자만 메모 작성·수정(열람은 전체 공개)
  private memos: Record<string, string> = {}; // "<article_no>|<seg_index>" → memo (전역 운영자 큐레이션)

  // 관리자 인라인 수정(개발계 전용) 상태
  private canEdit = false;                         // 백엔드 editable(관리자+개발계)
  private meta: ForeignLawMeta | null = null;      // 현재 법령 메타(재렌더용)
  private provisions: ForeignProvision[] = [];     // 현재 법령 seg 배열(재렌더·수정 원본)
  private pidMap = new Map<number, ForeignProvision>(); // provision_id → seg
  private modalEl: HTMLElement | null = null;      // 열린 편집 팝오버(표 바깥 오버레이)
  private popCleanup: (() => void) | null = null;  // 팝오버 바깥클릭 리스너 해제

  async initialize(): Promise<void> {
    const headerEl = document.getElementById('header');
    if (headerEl) {
      headerEl.innerHTML = this.header.render('foreign');
      this.header.setInfoButtonHandler();
    }

    // 운영자 여부(메모 작성·수정 가능) 판정. 메모 열람은 전체 공개라 별도 게이트 없음.
    const me = await this.resolveMe();
    this.canEditMemo = !!(me && me.authenticated && me.role === 'admin');

    this.laws = await this.model.getList();
    const results = document.getElementById('results')!;
    if (!this.laws.length) {
      results.innerHTML = '<div class="container"><div class="alert alert-danger">해외법령 목록을 불러올 수 없습니다.</div></div>';
      return;
    }

    this.renderDropdown();
    this.bindMemoDelegation();
    this.bindAdminEditDelegation();

    // ?code 가 있으면 그 법 본문(드릴다운), 없으면 국가별 소개 카탈로그(랜딩).
    const params = new URLSearchParams(location.search);
    const code = params.get('code');
    if (code && this.laws.some(l => l.code === code)) {
      await this.loadLaw(code);
    } else {
      this.renderOverview();
    }
  }

  /** 랜딩 = 국가별 소개 카탈로그. */
  private renderOverview(): void {
    this.currentCode = '';
    const box = document.getElementById('currentForeignBox');
    if (box) box.textContent = '국가별 목록';
    const results = document.getElementById('results')!;
    results.innerHTML = this.overview.render(this.laws);
    if (location.search) history.replaceState(null, '', location.pathname);
  }

  private async resolveMe(): Promise<any> {
    const p = (window as any).__lqMePromise;
    if (p && typeof p.then === 'function') {
      return p.then((m: any) => m).catch(() => null);
    }
    // 폴백: 직접 조회
    return fetch('/api/auth/me', { credentials: 'include' }).then(r => r.json()).catch(() => null);
  }

  private renderDropdown(): void {
    const menu = document.getElementById('foreignDropdownMenu');
    if (!menu) return;
    const groups: Record<string, ForeignLawListItem[]> = {};
    for (const l of this.laws) (groups[l.jurisdiction] ||= []).push(l);

    let html = '';
    for (const j of JURIS_ORDER) {
      const arr = groups[j];
      if (!arr) continue;
      html += `<li><h6 class="dropdown-header">${JURIS_LABEL[j] || j}</h6></li>`;
      for (const l of arr) {
        const onlyOrig = l.ko_count > 0 ? '' : ' <span class="text-muted small">(원문만)</span>';
        const active = l.code === this.currentCode ? ' active' : '';
        html += `<li><a class="dropdown-item${active}" href="?code=${l.code}">${this.esc(l.title_ko)}${onlyOrig}</a></li>`;
      }
    }
    menu.innerHTML = html;
  }

  private updateLabel(): void {
    const box = document.getElementById('currentForeignBox');
    const cur = this.laws.find(l => l.code === this.currentCode);
    if (box && cur) box.textContent = cur.abbrev || cur.title_ko;
  }

  private async loadLaw(code: string): Promise<void> {
    this.currentCode = code;
    const results = document.getElementById('results')!;
    results.innerHTML = '<div class="container py-5 text-center text-muted">불러오는 중…</div>';

    const data = await this.model.getProvisions(code);
    if (!data) {
      results.innerHTML = '<div class="container"><div class="alert alert-warning">법령을 불러오지 못했습니다.</div></div>';
      return;
    }
    this.meta = data.meta;
    this.provisions = data.provisions;
    this.canEdit = !!data.editable;
    this.pidMap.clear();
    for (const p of data.provisions) this.pidMap.set(p.provision_id, p);
    this.memos = await this.model.getMemos(code); // 전역 운영자 메모 — 전체 공개 열람
    this.renderLaw();
    history.replaceState(null, '', `?code=${code}`);
    this.updateLabel();
  }

  /** 현재 법령 표를 처음 그린다(법령 로드 시 1회). 인라인 수정은 셀 단위로만 갱신(여기 안 거침). */
  private renderLaw(): void {
    if (!this.meta) return;
    const results = document.getElementById('results')!;
    results.innerHTML = this.view.renderTable(this.meta, this.provisions, this.memos, this.canEditMemo, this.canEdit);
  }

  // ── 메모 편집 (이벤트 위임) — 운영자만. 일반 사용자에겐 읽기 전용. ───────────────
  private bindMemoDelegation(): void {
    const results = document.getElementById('results')!;
    results.addEventListener('click', (e) => {
      const cell = (e.target as HTMLElement).closest('.fm-memo') as HTMLElement | null;
      if (!cell) return;
      if (!this.canEditMemo) return; // 비운영자: 읽기 전용
      this.openMemoEditor(cell);
    });
  }

  /** 메모 편집 = 표 바깥 모달. 저장 시 해당 메모 셀만 갱신. */
  private openMemoEditor(cell: HTMLElement): void {
    const code = cell.dataset.code || this.currentCode;
    const article = cell.dataset.article || '';
    const seg = Number(cell.dataset.seg || 0);
    const key = `${article}|${seg}`;
    this.openAnchoredEditor(cell, {
      title: `메모 · 제${article}조 (${seg}번째 문단) — 모든 사용자에게 공개`,
      fields: [{ key: 'memo', label: '운영자 메모(해설)', value: this.memos[key] || '', rows: 6 }],
      onSave: async (v) => {
        const val = v.memo.trim();
        const ok = await this.model.saveMemo(code, article, seg, val);
        if (!ok) return false;
        if (val) this.memos[key] = val; else delete this.memos[key];
        cell.innerHTML = `<div class="fm-memo-view">${val ? this.esc(val) : '<span class="fm-memo-add">+ 메모</span>'}</div>`;
        return true;
      },
    });
  }

  // ── 관리자 본문 수정 (개발계 전용, 이벤트 위임) ──────────────────────────────
  private bindAdminEditDelegation(): void {
    const results = document.getElementById('results')!;
    results.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('.fm-admin-edit') as HTMLElement | null;
      if (!btn) return;
      e.preventDefault();
      if (btn.classList.contains('fm-edit-head')) {
        this.openHeadEditor(btn.closest('tr') as HTMLElement);
      } else {
        this.openCellEditor(btn.closest('td') as HTMLElement);
      }
    });
  }

  /** 원문(text_original) 또는 번역(text_ko) 셀을 모달로 편집. 저장 시 그 셀만 갱신. */
  private openCellEditor(td: HTMLElement | null): void {
    if (!td) return;
    const field = td.dataset.field as 'text_original' | 'text_ko';
    if (field !== 'text_original' && field !== 'text_ko') return;
    const pid = Number((td.closest('tr') as HTMLElement)?.dataset.pid || 0);
    const prov = this.pidMap.get(pid);
    if (!prov) return;
    this.openAnchoredEditor(td, {
      title: field === 'text_ko' ? '국문 번역 교정' : '원문 교정',
      fields: [{
        key: field,
        label: field === 'text_ko' ? '국문 번역 (text_ko · 비우면 원본 복귀)' : '원문 (text_original · 비우면 원본 복귀)',
        value: prov[field] || '', rows: 12, mono: field === 'text_original',
        warn: '원본은 보존되고 교정 레이어로 저장됩니다(이관에도 유지). 비우면 원본으로 되돌아갑니다.',
      }],
      onSave: async (v) => {
        const eff = await this.model.saveOverride(this.currentCode, prov.article_no, prov.seg_index, { [field]: v[field] });
        if (!eff) return false;
        prov[field] = eff[field] ? String(eff[field]) : null; // 실효값(교정값 또는 복귀된 원본)
        td.innerHTML = this.view.cellInner(field, prov, this.canEdit);
        return true;
      },
    });
  }

  /** 조 헤더(제목 국문 heading_ko / 원문 heading)를 모달로 편집. 저장 시 헤더 셀 + 목차 갱신. */
  private openHeadEditor(row: HTMLElement | null): void {
    const td = row?.querySelector('td') as HTMLElement | null;
    if (!td) return;
    const pid = Number(row!.dataset.pid || 0);
    const prov = this.pidMap.get(pid);
    if (!prov) return;
    this.openAnchoredEditor(td, {
      title: `조 제목 교정 · 제${prov.article_no}조`,
      fields: [
        { key: 'heading_ko', label: '조 제목 · 국문 (heading_ko · 목차에도 반영, 비우면 원본 복귀)', value: prov.heading_ko || '', rows: 2 },
        { key: 'heading', label: '조 제목 · 원문 (heading · 비우면 원본 복귀)', value: prov.heading || '', rows: 2 },
      ],
      onSave: async (v) => {
        const eff = await this.model.saveOverride(this.currentCode, prov.article_no, prov.seg_index, { heading_ko: v.heading_ko, heading: v.heading });
        if (!eff) return false;
        prov.heading_ko = eff.heading_ko ? String(eff.heading_ko) : null;
        prov.heading = eff.heading ? String(eff.heading) : null;
        td.innerHTML = this.view.headInner(prov, this.canEdit);
        const toc = document.querySelector('.fm-toc'); // 목차(조 칩)도 갱신 — article 수만큼이라 가볍다.
        if (toc) toc.outerHTML = this.view.buildTocHtml(this.provisions);
        return true;
      },
    });
  }

  // ── 공용 편집 팝오버 (클릭한 칸에 붙는 오버레이) ─────────────────────────────
  // 표 DOM 을 전혀 건드리지 않으므로 표 높이가 그대로 유지된다 → 열기/취소 시 대형 표
  // reflow(렉·프리즈)가 없다. 화면 중앙 모달이 아니라 클릭한 칸 바로 아래에 나타난다.
  // 저장 성공 시에만 호출자가 해당 셀 하나를 갱신한다.
  private openAnchoredEditor(anchor: HTMLElement, opts: {
    title: string;
    fields: Array<{ key: string; label: string; value: string; rows?: number; mono?: boolean; warn?: string }>;
    onSave: (values: Record<string, string>) => Promise<boolean>;
  }): void {
    this.closeModal();
    const fieldsHtml = opts.fields.map((f) => `
      <label class="fm-modal-label">${this.esc(f.label)}</label>
      ${f.warn ? `<div class="fm-ed-warn">${this.esc(f.warn)}</div>` : ''}
      <textarea class="form-control fm-modal-input${f.mono ? ' fm-mono' : ''}" data-key="${this.esc(f.key)}" rows="${f.rows || 6}">${this.esc(f.value)}</textarea>`).join('');
    const panel = document.createElement('div');
    panel.className = 'fm-pop';
    panel.setAttribute('role', 'dialog');
    panel.innerHTML = `
      <div class="fm-pop-head">${this.esc(opts.title)}</div>
      <div class="fm-modal-body">${fieldsHtml}</div>
      <div class="fm-modal-foot">
        <span class="fm-modal-msg text-muted small"></span>
        <button type="button" class="btn btn-sm btn-link fm-modal-cancel">취소</button>
        <button type="button" class="btn btn-sm btn-primary fm-modal-save">저장</button>
        <span class="text-muted small ms-2">Ctrl+Enter 저장 · Esc 취소</span>
      </div>`;
    document.body.appendChild(panel);
    this.modalEl = panel;

    // 위치: 클릭한 칸 바로 아래(뷰포트 밖으로 안 나가게 클램프). position:absolute + 문서좌표라 스크롤에 따라온다.
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 440), window.innerWidth - 24);
    let left = rect.left + window.scrollX;
    left = Math.min(left, window.scrollX + window.innerWidth - width - 12);
    left = Math.max(left, window.scrollX + 8);
    panel.style.width = width + 'px';
    panel.style.left = left + 'px';
    panel.style.top = (rect.bottom + window.scrollY + 4) + 'px';

    const msg = panel.querySelector('.fm-modal-msg') as HTMLElement;
    const collect = (): Record<string, string> => {
      const v: Record<string, string> = {};
      panel.querySelectorAll('.fm-modal-input').forEach((el) => {
        v[(el as HTMLElement).dataset.key!] = (el as HTMLTextAreaElement).value;
      });
      return v;
    };
    const save = async () => {
      msg.textContent = '저장 중…';
      const ok = await opts.onSave(collect());
      if (ok) this.closeModal();
      else msg.textContent = '저장 실패 (권한·운영 차단을 확인하세요)';
    };
    (panel.querySelector('.fm-modal-save') as HTMLElement).onclick = save;
    (panel.querySelector('.fm-modal-cancel') as HTMLElement).onclick = () => this.closeModal();
    panel.addEventListener('keydown', (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') { ev.preventDefault(); this.closeModal(); }
      else if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); save(); }
    });
    // 바깥 클릭 시 닫기(여는 클릭이 곧바로 닫지 않도록 다음 tick부터 감시).
    const onDocDown = (e: MouseEvent) => { if (!panel.contains(e.target as Node)) this.closeModal(); };
    const t = window.setTimeout(() => document.addEventListener('mousedown', onDocDown), 0);
    this.popCleanup = () => { window.clearTimeout(t); document.removeEventListener('mousedown', onDocDown); };

    const first = panel.querySelector('.fm-modal-input') as HTMLTextAreaElement | null;
    if (first) { first.focus(); first.setSelectionRange(first.value.length, first.value.length); }
  }

  private closeModal(): void {
    if (this.popCleanup) { this.popCleanup(); this.popCleanup = null; }
    if (this.modalEl) { this.modalEl.remove(); this.modalEl = null; }
  }

  private esc(s: string): string {
    return String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  }
}
