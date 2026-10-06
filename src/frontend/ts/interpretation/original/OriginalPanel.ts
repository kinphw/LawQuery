import { mountPdf, PdfHandle, PdfHits } from '../../press/PdfView';

/**
 * 법령해석 원문 보기 — 포털 회신 첨부(HWP·HWPX·PDF)를 결과표 옆 창에 PDF 로 그린다.
 *
 * - 상세 줄(질의요지·회답·이유)을 펼치면 그 아래에 원문 파일 줄이 달린다(`attachOriginals`). 파일이 없으면 아무것도 달지 않는다.
 * - 파일을 누르면 화면 오른쪽 창(`#iqDoc`)에 열린다. 그리는 것은 보도자료와 같은 `press/PdfView`(pdf.js) —
 *   서버가 PDF 는 그대로, HWP 는 한/글로 변환해 준다.
 * - 넓은 화면(≥1200)은 표와 창이 나란히, 그보다 좁으면 창이 화면을 덮는다(assets/scss/interpretation/_original.scss).
 * - 로컬(오프라인)판은 이 모듈을 `src/local/originalStub.ts` 로 갈아끼운다(원문 파일도 pdf.js 도 싣지 않는다).
 */
interface OriginalFile { sha: string; name: string; ext: string; size: number; how: 'pdf' | 'convert' | 'none'; ready: boolean; }
interface Originals { sourceUrl: string | null; files: OriginalFile[]; }

export interface OriginalMeta { kind: string; serial: string; title: string; }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);
const fileUrl = (id: number, sha: string, raw = false) => `/api/interpretation/original/${id}/${sha}${raw ? '?raw=1' : ''}`;

const cache = new Map<number, Promise<Originals>>();

function load(id: number): Promise<Originals> {
  let p = cache.get(id);
  if (!p) {
    p = fetch(`/api/interpretation/files/${id}`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : { files: [] }))
      .then((j: Partial<Originals>) => ({ sourceUrl: j.sourceUrl ?? null, files: j.files ?? [] }))
      .catch(() => ({ sourceUrl: null, files: [] }));
    cache.set(id, p);
  }
  return p;
}

/** 검색칸의 낱말 — 원문을 열면 그 말이 있는 쪽으로 간다. */
function searchTokens(): string[] {
  const v = (document.getElementById('keywordInput') as HTMLInputElement | null)?.value ?? '';
  return v.split(/\s+/).filter(Boolean);
}

/** 상세 칸 아래에 원문 파일 줄을 단다. */
export async function attachOriginals(cell: HTMLElement, id: number, meta: OriginalMeta): Promise<void> {
  const o = await load(id);
  if (!cell.isConnected || (!o.files.length && !o.sourceUrl)) return;
  const row = document.createElement('div');
  row.className = 'iq-files';
  row.innerHTML = `<strong class="iq-files__label">원문</strong>`
    + o.files.map((f) => f.how === 'none'
      ? `<a class="btn btn-sm btn-outline-secondary iq-file" href="${fileUrl(id, f.sha, true)}" title="${esc(f.name)} 내려받기">
           <i class="fas fa-download"></i><span class="iq-file__name">${esc(f.name)}</span><small>${kb(f.size)}</small></a>`
      : `<button type="button" class="btn btn-sm btn-outline-primary iq-file" data-sha="${f.sha}" title="${esc(f.name)}">
           <i class="fas fa-file-lines"></i><span class="iq-file__name">${esc(f.name)}</span><small>${kb(f.size)}</small></button>`).join('')
    + (o.sourceUrl ? `<a class="btn btn-sm btn-link iq-files__portal" href="${esc(o.sourceUrl)}" target="_blank" rel="noopener noreferrer">포털에서 보기 ↗</a>` : '');
  row.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-sha]');
    if (b) panel.open(id, meta, o, b.dataset.sha!);
  });
  cell.appendChild(row);
}

class OriginalPanel {
  private el: HTMLElement | null = null;
  private pdf: PdfHandle | null = null;
  private cur: { id: number; meta: OriginalMeta; o: Originals; sha: string } | null = null;
  /** 창의 찾기 칸에 직접 넣은 말(null 이면 검색칸의 말을 그대로 쓴다). */
  private findQ: string | null = null;

  private host(): HTMLElement {
    if (this.el) return this.el;
    const el = document.createElement('aside');
    el.id = 'iqDoc';
    el.className = 'pr-viewer iq-doc';
    el.hidden = true;
    el.setAttribute('aria-label', '원문 보기');
    document.body.appendChild(el);
    el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-act="close"]')) { this.close(); return; }
      const f = t.closest<HTMLElement>('[data-file]');
      if (f && this.cur) { this.open(this.cur.id, this.cur.meta, this.cur.o, f.dataset.file!); return; }
      const j = t.closest<HTMLElement>('[data-jump]');
      if (j) this.pdf?.go(Number(j.dataset.jump));
    });
    el.addEventListener('submit', (e) => {
      e.preventDefault();
      this.findQ = (el.querySelector('#iqFindQ') as HTMLInputElement).value.trim();
      this.pdf?.find(this.tokens());
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.cur && !document.querySelector('.modal.show')) this.close();
    });
    this.el = el;
    return el;
  }

  private tokens(): string[] {
    return this.findQ == null ? searchTokens() : this.findQ ? [this.findQ] : [];
  }

  open(id: number, meta: OriginalMeta, o: Originals, sha: string): void {
    const file = o.files.find((f) => f.sha === sha);
    if (!file) return;
    if (!this.cur || this.cur.id !== id) this.findQ = null;
    this.cur = { id, meta, o, sha };
    const el = this.host();
    const shown = o.files.filter((f) => f.how !== 'none');
    const tabs = shown.length > 1
      ? `<div class="pr-viewer__files">${shown.map((f) =>
          `<button type="button" class="btn btn-sm btn-outline-secondary pr-tab${f.sha === sha ? ' active' : ''}" data-file="${f.sha}" title="${esc(f.name)}">${esc(f.name)}</button>`).join('')}</div>`
      : '';
    el.innerHTML = `
      <div class="pr-viewer__bar">
        <div class="pr-viewer__title" title="${esc(meta.title)}">
          <span class="pr-viewer__meta">${esc(meta.kind)} · ${esc(meta.serial)}</span>${esc(meta.title)}
        </div>
        <div class="pr-viewer__tools">
          <form class="pr-find" role="search">
            <input type="search" id="iqFindQ" class="form-control form-control-sm" placeholder="문서 안 찾기" aria-label="문서 안 찾기"
              value="${esc(this.findQ ?? searchTokens()[0] ?? '')}" />
            <span class="pr-find__pos" id="iqFindPos"></span>
            <button type="button" data-jump="-1" aria-label="이전 일치">▲</button>
            <button type="button" data-jump="1" aria-label="다음 일치">▼</button>
          </form>
          <a class="btn btn-sm btn-outline-secondary" href="${fileUrl(id, sha, true)}" title="${esc(file.name)} 내려받기">원본 받기</a>
          ${o.sourceUrl ? `<a class="btn btn-sm btn-outline-secondary" href="${esc(o.sourceUrl)}" target="_blank" rel="noopener noreferrer">포털 ↗</a>` : ''}
          <button type="button" class="btn btn-sm btn-outline-secondary" data-act="close" aria-label="닫기">✕ 닫기</button>
        </div>
      </div>
      ${tabs}
      <div class="pr-viewer__content pr-pdf" id="iqContent"><div class="pr-pdf__msg">원문 보기를 준비하는 중…</div></div>`;
    el.hidden = false;
    el.scrollTop = 0;
    document.body.classList.add('iq-reading');
    this.markOpen();

    this.pdf?.destroy();
    this.pdf = null;
    const content = el.querySelector<HTMLElement>('#iqContent')!;
    const pos = el.querySelector<HTMLElement>('#iqFindPos')!;
    this.pdf = mountPdf(content, fileUrl(id, sha), file.how === 'convert' && !file.ready, this.tokens(), (h: PdfHits) => {
      pos.textContent = !h.active ? '' : h.total ? `${h.idx + 1}/${h.total}쪽${h.scanned ? '' : '…'}` : h.scanned ? '없음' : '찾는 중…';
    });
    file.ready = true; // 한 번 열면 서버에 변환본이 남는다(실패하면 PdfView 가 알린다)
  }

  close(): void {
    this.pdf?.destroy();
    this.pdf = null;
    this.cur = null;
    this.findQ = null;
    if (this.el) { this.el.hidden = true; this.el.innerHTML = ''; }
    document.body.classList.remove('iq-reading');
    this.markOpen();
  }

  /** 열려 있는 파일의 단추를 눌린 모습으로. */
  private markOpen(): void {
    document.querySelectorAll<HTMLElement>('.iq-file[data-sha]').forEach((b) => {
      b.classList.toggle('active', !!this.cur && b.dataset.sha === this.cur.sha);
    });
  }
}

const panel = new OriginalPanel();
