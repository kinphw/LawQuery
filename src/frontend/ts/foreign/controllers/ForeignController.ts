import { ForeignFetchModel, ForeignLawListItem } from '../models/ForeignFetchModel';
import { ForeignView } from '../views/ForeignView';
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
  private header = new Header();
  private laws: ForeignLawListItem[] = [];
  private currentCode = '';
  private canMemo = false;
  private memos: Record<number, string> = {};

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

    const params = new URLSearchParams(location.search);
    this.currentCode = params.get('code') || this.pickDefault();
    this.renderDropdown();
    this.bindMemoDelegation();
    await this.loadLaw(this.currentCode);
  }

  private async resolveMe(): Promise<any> {
    const p = (window as any).__lqMePromise;
    if (p && typeof p.then === 'function') {
      return p.then((m: any) => m).catch(() => null);
    }
    // 폴백: 직접 조회
    return fetch('/api/auth/me', { credentials: 'include' }).then(r => r.json()).catch(() => null);
  }

  private pickDefault(): string {
    const pref = this.laws.find(l => l.code === 'eu_psr')
      || this.laws.find(l => l.ko_count > 0)
      || this.laws[0];
    return pref.code;
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
    this.memos = this.canMemo ? (await this.model.getMemos(code) || {}) : {};
    results.innerHTML = this.view.renderTable(data.meta, data.provisions, this.memos, this.canMemo);
    history.replaceState(null, '', `?code=${code}`);
    this.updateLabel();
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
    const pid = Number(cell.dataset.pid);
    const code = cell.dataset.code || this.currentCode;
    const cur = this.memos[pid] || '';
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
      const ok = await this.model.saveMemo(pid, code, val);
      if (ok) {
        if (val) this.memos[pid] = val; else delete this.memos[pid];
      } else {
        alert('메모 저장에 실패했습니다.');
      }
      this.closeEditor(cell, pid);
    };
    (cell.querySelector('.fm-save') as HTMLElement).onclick = save;
    (cell.querySelector('.fm-cancel') as HTMLElement).onclick = () => this.closeEditor(cell, pid);
    ta.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); save(); }
      else if (ev.key === 'Escape') { ev.preventDefault(); this.closeEditor(cell, pid); }
    });
  }

  private closeEditor(cell: HTMLElement, pid: number): void {
    cell.classList.remove('fm-editing');
    const memo = this.memos[pid];
    cell.innerHTML = `<div class="fm-memo-view">${memo ? this.esc(memo) : '<span class="fm-memo-add">+ 메모</span>'}</div>`;
  }

  private esc(s: string): string {
    return String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  }
}
