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
  private canMemo = false;
  private memos: Record<string, string> = {}; // "<article_no>|<seg_index>" → memo

  // 관리자 인라인 수정(개발계 전용) 상태
  private canEdit = false;                         // 백엔드 editable(관리자+개발계)
  private meta: ForeignLawMeta | null = null;      // 현재 법령 메타(재렌더용)
  private provisions: ForeignProvision[] = [];     // 현재 법령 seg 배열(재렌더·수정 원본)
  private pidMap = new Map<number, ForeignProvision>(); // provision_id → seg

  async initialize(): Promise<void> {
    const headerEl = document.getElementById('header');
    if (headerEl) {
      headerEl.innerHTML = this.header.render('foreign');
      this.header.setInfoButtonHandler();
    }

    // PRO 여부(메모 편집 가능) 판정
    const me = await this.resolveMe();
    this.canMemo = !!(me && me.authenticated && me.plan === 'pro');

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
    this.memos = this.canMemo ? (await this.model.getMemos(code) || {}) : {};
    this.renderLaw();
    history.replaceState(null, '', `?code=${code}`);
    this.updateLabel();
  }

  /** 현재 법령 표를 처음 그린다(법령 로드 시 1회). 인라인 수정은 셀 단위로만 갱신(여기 안 거침). */
  private renderLaw(): void {
    if (!this.meta) return;
    const results = document.getElementById('results')!;
    results.innerHTML = this.view.renderTable(this.meta, this.provisions, this.memos, this.canMemo, this.canEdit);
  }

  // ── 메모 편집 (이벤트 위임) ──────────────────────────────────────────────────
  private bindMemoDelegation(): void {
    const results = document.getElementById('results')!;
    results.addEventListener('click', (e) => {
      const cell = (e.target as HTMLElement).closest('.fm-memo') as HTMLElement | null;
      if (!cell) return;
      if (cell.classList.contains('fm-locked')) {
        const next = encodeURIComponent(location.pathname.replace(/^\//, '') + location.search);
        location.href = `login.html?next=${next}`;
        return;
      }
      if (cell.classList.contains('fm-editing')) return;
      this.openEditor(cell);
    });
  }

  private openEditor(cell: HTMLElement): void {
    const code = cell.dataset.code || this.currentCode;
    const article = cell.dataset.article || '';
    const seg = Number(cell.dataset.seg || 0);
    const key = `${article}|${seg}`;
    const cur = this.memos[key] || '';
    cell.classList.add('fm-editing');
    cell.innerHTML = `
      <textarea class="form-control fm-memo-input" rows="4" placeholder="이 조문에 대한 메모…">${this.esc(cur)}</textarea>
      <div class="fm-memo-actions">
        <button type="button" class="btn btn-sm btn-primary fm-save">저장</button>
        <button type="button" class="btn btn-sm btn-link fm-cancel">취소</button>
        <span class="text-muted small ms-auto">Ctrl+Enter 저장</span>
      </div>`;
    const ta = cell.querySelector('textarea') as HTMLTextAreaElement;
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);

    const save = async () => {
      const val = ta.value.trim();
      const ok = await this.model.saveMemo(code, article, seg, val);
      if (ok) {
        if (val) this.memos[key] = val; else delete this.memos[key];
      } else {
        alert('메모 저장에 실패했습니다.');
      }
      this.closeEditor(cell, key);
    };
    (cell.querySelector('.fm-save') as HTMLElement).onclick = save;
    (cell.querySelector('.fm-cancel') as HTMLElement).onclick = () => this.closeEditor(cell, key);
    ta.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); save(); }
      else if (ev.key === 'Escape') { ev.preventDefault(); this.closeEditor(cell, key); }
    });
  }

  private closeEditor(cell: HTMLElement, key: string): void {
    cell.classList.remove('fm-editing');
    const memo = this.memos[key];
    cell.innerHTML = `<div class="fm-memo-view">${memo ? this.esc(memo) : '<span class="fm-memo-add">+ 메모</span>'}</div>`;
  }

  // ── 관리자 본문 인라인 수정 (개발계 전용, 이벤트 위임) ────────────────────────
  // 칸(셀) 단위로 그 자리에서 편집한다. 표 전체가 아니라 클릭한 셀 하나만 textarea로 바뀌고
  // 저장 시에도 그 셀만 다시 그린다 → 8천 행짜리 대형 법령에서도 렉이 없다.
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

  /** 원문(text_original) 또는 번역(text_ko) 셀을 그 자리에서 textarea로 편집. */
  private openCellEditor(td: HTMLElement | null): void {
    if (!td || td.classList.contains('fm-cell-editing')) return;
    const field = td.dataset.field as 'text_original' | 'text_ko';
    if (field !== 'text_original' && field !== 'text_ko') return;
    const pid = Number((td.closest('tr') as HTMLElement)?.dataset.pid || 0);
    const prov = this.pidMap.get(pid);
    if (!prov) return;

    td.classList.add('fm-cell-editing');
    const warn = field === 'text_original'
      ? `<div class="fm-ed-warn">⚠ 원문 수정은 STN 재적재 시 덮어쓰일 수 있습니다.</div>` : '';
    td.innerHTML = `
      <textarea class="form-control fm-ed-input" rows="8">${this.esc(prov[field] || '')}</textarea>${warn}
      <div class="fm-edit-actions">
        <button type="button" class="btn btn-sm btn-primary fm-ed-save">저장</button>
        <button type="button" class="btn btn-sm btn-link fm-ed-cancel">취소</button>
        <span class="fm-ed-msg text-muted small ms-2"></span>
        <span class="text-muted small ms-auto">Ctrl+Enter 저장 · Esc 취소</span>
      </div>`;
    const ta = td.querySelector('textarea') as HTMLTextAreaElement;
    const msgEl = td.querySelector('.fm-ed-msg') as HTMLElement;
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);

    const restore = () => {
      td.classList.remove('fm-cell-editing');
      td.innerHTML = this.view.cellInner(field, prov, this.canEdit);
    };
    const save = async () => {
      const val = ta.value;
      msgEl.textContent = '저장 중…';
      const ok = await this.model.updateProvision(pid, { [field]: val });
      if (!ok) { msgEl.textContent = '저장 실패 (권한·운영 차단 확인)'; return; }
      prov[field] = val.trim() ? val : null; // 빈값 → null(서버 저장 의미와 동일)
      restore();
    };
    (td.querySelector('.fm-ed-save') as HTMLElement).onclick = save;
    (td.querySelector('.fm-ed-cancel') as HTMLElement).onclick = restore;
    ta.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); save(); }
      else if (ev.key === 'Escape') { ev.preventDefault(); restore(); }
    });
  }

  /** 조 헤더(제목 국문 heading_ko / 원문 heading)를 그 자리에서 편집. 저장 시 목차도 갱신. */
  private openHeadEditor(row: HTMLElement | null): void {
    const td = row?.querySelector('td') as HTMLElement | null;
    if (!td || td.classList.contains('fm-cell-editing')) return;
    const pid = Number(row!.dataset.pid || 0);
    const prov = this.pidMap.get(pid);
    if (!prov) return;

    td.classList.add('fm-cell-editing');
    td.innerHTML = `
      <div class="fm-edit-grid">
        <label class="fm-edit-label">조 제목 · 국문 <span class="text-muted small">(목차에도 반영)</span></label>
        <input type="text" class="form-control fm-ed-hko" value="${this.esc(prov.heading_ko || '')}">
        <label class="fm-edit-label">조 제목 · 원문</label>
        <input type="text" class="form-control fm-ed-h" value="${this.esc(prov.heading || '')}">
      </div>
      <div class="fm-edit-actions">
        <button type="button" class="btn btn-sm btn-primary fm-ed-save">저장</button>
        <button type="button" class="btn btn-sm btn-link fm-ed-cancel">취소</button>
        <span class="fm-ed-msg text-muted small ms-2"></span>
        <span class="text-muted small ms-auto">Enter 저장 · Esc 취소</span>
      </div>`;
    const hko = td.querySelector('.fm-ed-hko') as HTMLInputElement;
    const h = td.querySelector('.fm-ed-h') as HTMLInputElement;
    const msgEl = td.querySelector('.fm-ed-msg') as HTMLElement;
    hko.focus();

    const restore = () => {
      td.classList.remove('fm-cell-editing');
      td.innerHTML = this.view.headInner(prov, this.canEdit);
    };
    const save = async () => {
      msgEl.textContent = '저장 중…';
      const ok = await this.model.updateProvision(pid, { heading_ko: hko.value, heading: h.value });
      if (!ok) { msgEl.textContent = '저장 실패'; return; }
      prov.heading_ko = hko.value.trim() ? hko.value : null;
      prov.heading = h.value.trim() ? h.value : null;
      restore();
      // 목차(조 칩)도 갱신 — article 수만큼이라 가볍다.
      const toc = document.querySelector('.fm-toc');
      if (toc) toc.outerHTML = this.view.buildTocHtml(this.provisions);
    };
    (td.querySelector('.fm-ed-save') as HTMLElement).onclick = save;
    (td.querySelector('.fm-ed-cancel') as HTMLElement).onclick = restore;
    td.addEventListener('keydown', (ev: KeyboardEvent) => {
      if (ev.key === 'Enter') { ev.preventDefault(); save(); }
      else if (ev.key === 'Escape') { ev.preventDefault(); restore(); }
    });
  }

  private esc(s: string): string {
    return String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  }
}
