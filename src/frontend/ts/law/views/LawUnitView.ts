import { ToastManager } from '../../common/components/ToastManager';
import { LawFetchUnitModel, LawUnitRow } from '../models/LawFetchUnitModel';
import type { LawMeta } from '../models/LawFetchMetaModel';

/**
 * 단일 조회 뷰 (법/시행령/감독규정/세칙 중 한 단을 통째로).
 *
 * 연계표(LawTable)와 "동일한 하나의 기능"으로 통합되어, 상단 토글로 전환된다.
 * 디자인도 연계표를 정답으로 삼아 동일한 마크업(law-table / law-box / box-item,
 * 시행예정 diff 박스)을 그대로 사용해 일관성을 맞춘다.
 *
 * 데이터는 회원가입 없이 접근 가능한 /api/law/unit (origin a/e/s/r)에서 받는다.
 */
export class LawUnitView {
  private toast = new ToastManager();
  private model = new LawFetchUnitModel();

  private meta: LawMeta[];
  private currentOrigin = 'a';
  private currentRows: LawUnitRow[] = [];
  private textSize = ''; // '' | 'fs-5' | 'small' — 연계표와 동일한 크기 클래스

  // /unit이 지원하는 단위(db_a/e/s/r/b). b(5단째)는 법령마다 다름(여신/신정=시행세칙).
  // 실제 노출은 db_meta에 존재하는 origin만 → 4단(전금) DB엔 b가 없어 자동 제외.
  private static readonly UNIT_ORIGINS = ['a', 'e', 's', 'r', 'b'];
  // 연계표 LawTable.COL_CLASS와 동일한 컬럼별 색/스타일을 단일뷰에도 적용
  private static readonly COL_CLASS: Record<string, string> = {
    a: 'law-title', e: 'decree-title', s: 'regulation-title', r: 'rule-title', b: 'book-title',
  };
  private static readonly FALLBACK_LABEL: Record<string, string> = {
    a: '법', e: '시행령', s: '감독규정', r: '시행세칙', b: '시행세칙',
  };

  constructor(meta: LawMeta[]) {
    this.meta = meta;
  }

  /** 단일 조회 화면 구성 + 첫 단위 로드. */
  async start(): Promise<void> {
    this.renderSelector();
    this.bindSelector();
    this.bindTextSearch();
    this.bindTextSize();
    this.syncTextSize();
    await this.loadUnit(this.currentOrigin);
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

  /** 단위 선택 세그먼트(연계표 토글과 동일 톤)를 #results 위에 삽입. */
  private renderSelector(): void {
    const results = document.getElementById('results');
    if (!results) return;
    const units = this.units();
    const buttons = units
      .map(
        (u, i) =>
          `<button type="button" class="btn btn-sm ${i === 0 ? 'btn-secondary' : 'btn-outline-secondary'} lq-unit-btn" data-origin="${u.origin}">${this.esc(u.label)}</button>`
      )
      .join('');

    let host = document.getElementById('lq-unit-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'lq-unit-host';
      host.className = 'container mb-2';
      // 조회 컨트롤을 한곳에 모으도록 토글 바로 아래에 배치(없으면 results 위)
      const toggle = document.getElementById('lawViewToggleHost');
      if (toggle && toggle.parentElement) toggle.parentElement.insertBefore(host, toggle.nextSibling);
      else results.parentElement?.insertBefore(host, results);
    }
    host.innerHTML = `
      <div class="d-flex justify-content-center align-items-center gap-2 flex-wrap">
        <span class="text-muted small">단위</span>
        <div class="btn-group" role="group" id="lq-unit-buttons">${buttons}</div>
      </div>`;
  }

  private bindSelector(): void {
    document.getElementById('lq-unit-buttons')?.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('.lq-unit-btn') as HTMLElement | null;
      if (!btn) return;
      document.querySelectorAll('.lq-unit-btn').forEach((b) => {
        b.classList.toggle('btn-secondary', b === btn);
        b.classList.toggle('btn-outline-secondary', b !== btn);
      });
      this.loadUnit(btn.dataset.origin!);
    });
  }

  private bindTextSearch(): void {
    const input = document.getElementById('lawTextSearch') as HTMLInputElement | null;
    const btn = document.getElementById('lawTextSearchBtn');
    const run = () => this.renderTable(input?.value.trim() || '');
    btn?.addEventListener('click', run);
    input?.addEventListener('keypress', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') { e.preventDefault(); run(); }
    });
  }

  /** 플로팅 글자크기 컨트롤을 단일뷰에도 연결(연계표와 동일 동작). */
  private bindTextSize(): void {
    document.querySelectorAll('input[name="textSize"]').forEach((radio) => {
      radio.addEventListener('change', (e) => {
        this.textSize = (e.target as HTMLInputElement).value;
        const input = document.getElementById('lawTextSearch') as HTMLInputElement | null;
        this.renderTable(input?.value.trim() || '');
      });
    });
  }

  private syncTextSize(): void {
    const checked = document.querySelector('input[name="textSize"]:checked') as HTMLInputElement | null;
    this.textSize = checked?.value || '';
  }

  private async loadUnit(origin: string): Promise<void> {
    this.currentOrigin = origin;
    const results = document.getElementById('results');
    if (results) results.innerHTML =
      '<div class="text-center p-4"><div class="spinner-border text-secondary" role="status"></div></div>';
    this.currentRows = await this.model.getUnit(origin);
    const input = document.getElementById('lawTextSearch') as HTMLInputElement | null;
    this.renderTable(input?.value.trim() || '');
    this.toast.showToast(`${this.unitLabel(origin)} ${this.currentRows.length}개 조문`);
  }

  private unitLabel(origin: string): string {
    return this.units().find((u) => u.origin === origin)?.label
      || LawUnitView.FALLBACK_LABEL[origin] || origin;
  }

  /** 연계표(LawTable)와 동일한 마크업의 1컬럼 테이블로 렌더. */
  private renderTable(search: string): void {
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
      results.innerHTML = `<div class="alert alert-warning">${search ? '검색 결과가 없습니다.' : '표시할 내용이 없습니다.'}</div>`;
      return;
    }

    const colClass = LawUnitView.COL_CLASS[this.currentOrigin] || 'law-title';
    const fullName = this.meta.find((m) => m.origin === this.currentOrigin)?.full_name || this.unitLabel(this.currentOrigin);
    const nameParts = fullName.split('\n');
    const thead = `
      <thead class="table-dark sticky-top">
        <tr>
          <th class="text-center py-1">
            <div class="small">${this.esc(nameParts[0])}</div>
            <div class="text-xs">${nameParts.slice(1).map((p) => this.esc(p)).join('<br>')}</div>
          </th>
        </tr>
      </thead>`;

    const body = rows.map((r) => this.renderRow(r, colClass, search)).join('');

    results.innerHTML =
      `<div class="table-responsive"><table class="table table-bordered law-table">${thead}<tbody>${body}</tbody></table></div>`;
  }

  private renderRow(r: LawUnitRow, colClass: string, search: string): string {
    // 장/절 제목행(법 db_a): id 없이 제목만 → title-row 로 (연계표와 동일)
    if (r.id === null && r.title) {
      return `<tr class="title-row"><td class="${colClass} law-box ${this.textSize}">${this.formatContent(r.title, null, null, search)}</td></tr>`;
    }
    const idAttr = r.id ? ` data-id="${this.esc(r.id)}"` : '';
    return `<tr><td class="${colClass} law-box ${this.textSize}"${idAttr}>${this.formatContent(r.content, r.content_sched, r.sched_date, search)}</td></tr>`;
  }

  /** LawTable.formatContent와 동일: 본문 박스 + 시행예정 diff 박스. */
  private formatContent(text: string | null, scheduledText: string | null, scheduledDate: string | null, searchText: string): string {
    const highlight = (s: string): string => {
      if (!searchText) return s;
      const safe = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return s.replace(new RegExp(safe, 'gi'), (m) => `<span class="text-danger fw-bold">${m}</span>`);
    };

    const parts: string[] = [];

    if (text) {
      const c = highlight(this.esc(text)).replace(/\n/g, '<br>');
      parts.push(`<div class="box-item small p-2 m-0">${c}</div>`);
    }

    if (scheduledText) {
      let inner: string;
      if (text) {
        const { diff_match_patch, DIFF_DELETE, DIFF_INSERT } = require('diff-match-patch');
        const dmp = new diff_match_patch();
        const diffs = dmp.diff_main(text, scheduledText);
        dmp.diff_cleanupSemantic(diffs);
        inner = '';
        for (const [op, data] of diffs as [number, string][]) {
          const seg = highlight(this.esc(data)).replace(/\n/g, '<br>');
          if (op === DIFF_DELETE) inner += `<del class="law-del">${seg}</del>`;
          else if (op === DIFF_INSERT) inner += `<ins class="law-ins">${seg}</ins>`;
          else inner += seg;
        }
      } else {
        inner = highlight(this.esc(scheduledText)).replace(/\n/g, '<br>');
      }
      const schedLabel = scheduledDate ? `시행예정 ${this.esc(scheduledDate)}` : '시행예정';
      parts.push(`<div class="box-item small p-2 m-0 box-item--scheduled" data-sched-label="${schedLabel}">${inner}</div>`);
    }

    return parts.join('');
  }

  private esc(s: string): string {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
    );
  }
}
