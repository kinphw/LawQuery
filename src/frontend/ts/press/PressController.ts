import { Header } from '../common/components/Header';
import { pressApi, PressDoc, PressFile, PressItem, PressQuery, PressSource } from './PressApi';
import { mountPdf } from './PdfView';

const SHORT: Record<string, string> = { fsc: '금융위', fss: '금감원', moef: '기재부', bok: '한은' };
const MODE_KEY = 'lq:press:mode';
type Mode = 'original' | 'text';
/** 문서를 열면 목록을 접는 폭 — assets/scss/press/_base.scss 의 미디어 쿼리와 같은 값이어야 한다. */
const NARROW = '(max-width: 991.98px)';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const num = (n: number) => n.toLocaleString('ko-KR');

/** 검색어를 <mark> 로 감싼 HTML. 서버의 LIKE(대소문자 무시)와 같은 눈으로 찾는다. */
function hl(text: string, tokens: string[]): string {
  if (!tokens.length || !text) return esc(text);
  const re = new RegExp(
    [...tokens].sort((a, b) => b.length - a.length).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi',
  );
  let out = '';
  let last = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    out += esc(text.slice(last, i)) + `<mark>${esc(m[0])}</mark>`;
    last = i + m[0].length;
  }
  return out + esc(text.slice(last));
}

/**
 * 기관 보도자료 — 금융위·금감원·기재부·한은 통합검색 + 원문(PDF 렌더링)/텍스트 보기.
 * 화면 상태(검색 조건·연 문서)는 URL 쿼리에 둔다: q, in, src, from, to, open.
 */
export class PressController {
  private query: PressQuery = { q: '', in: 'all', source: [], from: '', to: '' };
  private tokens: string[] = [];
  private items: PressItem[] = [];
  private page = 1;
  private more = false;
  private sources: PressSource[] = [];
  private counts: { total: number; bySource: Record<string, number> } | null = null;
  private openId: number | null = null;
  private seq = 0;
  private docSeq = 0;
  private unmountPdf: (() => void) | null = null;
  private mode: Mode = 'original';

  private $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

  async initialize(): Promise<void> {
    const header = new Header();
    this.$('header').innerHTML = header.render('press');
    header.setInfoButtonHandler();

    try { if (localStorage.getItem(MODE_KEY) === 'text') this.mode = 'text'; } catch { /* 저장소를 못 써도 그만 */ }
    this.readUrl();
    this.bind();
    this.renderSources();
    void pressApi.sources().then((r) => { this.sources = r.sources; this.renderSources(); }).catch(() => undefined);
    await this.search();
    if (this.openId) void this.open(this.openId);
  }

  // ── URL ↔ 상태 ───────────────────────────────────────────────
  private readUrl(): void {
    const sp = new URLSearchParams(location.search);
    const w = sp.get('in');
    this.query = {
      q: (sp.get('q') || '').trim(),
      in: w === 'title' || w === 'body' ? w : 'all',
      source: (sp.get('src') || '').split(',').filter((s) => s in SHORT),
      from: sp.get('from') || '',
      to: sp.get('to') || '',
    };
    const open = parseInt(sp.get('open') || '', 10);
    this.openId = Number.isFinite(open) ? open : null;
    this.$<HTMLInputElement>('prQ').value = this.query.q;
    this.$<HTMLSelectElement>('prIn').value = this.query.in;
    this.$<HTMLInputElement>('prFrom').value = this.query.from;
    this.$<HTMLInputElement>('prTo').value = this.query.to;
  }

  private writeUrl(): void {
    const sp = new URLSearchParams();
    const q = this.query;
    if (q.q) sp.set('q', q.q);
    if (q.in !== 'all') sp.set('in', q.in);
    if (q.source.length) sp.set('src', q.source.join(','));
    if (q.from) sp.set('from', q.from);
    if (q.to) sp.set('to', q.to);
    if (this.openId) sp.set('open', String(this.openId));
    const s = sp.toString();
    history.replaceState(null, '', s ? `${location.pathname}?${s}` : location.pathname);
  }

  // ── 이벤트 ───────────────────────────────────────────────────
  private bind(): void {
    this.$<HTMLFormElement>('prForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.query.q = this.$<HTMLInputElement>('prQ').value.trim();
      this.query.in = this.$<HTMLSelectElement>('prIn').value as PressQuery['in'];
      this.query.from = this.$<HTMLInputElement>('prFrom').value;
      this.query.to = this.$<HTMLInputElement>('prTo').value;
      void this.search();
    });

    this.$('prSources').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-src]');
      if (!b) return;
      const code = b.dataset.src!;
      if (!code) this.query.source = [];
      else if (this.query.source.includes(code)) this.query.source = this.query.source.filter((s) => s !== code);
      else this.query.source = [...this.query.source, code];
      if (this.query.source.length === Object.keys(SHORT).length) this.query.source = [];
      this.renderSources();
      void this.search(false);
    });

    this.$('prList').addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('#prMore')) { void this.loadMore(); return; }
      const f = t.closest<HTMLElement>('[data-id]');
      if (f) void this.open(Number(f.dataset.id));
    });

    this.$('prViewer').addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-act="close"]')) { this.close(); return; }
      const m = t.closest<HTMLElement>('[data-mode]');
      if (m) { this.setMode(m.dataset.mode as Mode); return; }
      const f = t.closest<HTMLElement>('[data-file]');
      if (f) { void this.open(Number(f.dataset.file)); return; }
      const j = t.closest<HTMLElement>('[data-jump]');
      if (j) this.jump(Number(j.dataset.jump));
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.openId && !document.querySelector('.modal.show')) this.close();
    });
  }

  // ── 기관 단추 ────────────────────────────────────────────────
  private renderSources(): void {
    const sel = this.query.source;
    const n = (code: string): string => {
      const v = this.counts ? this.counts.bySource[code] : this.sources.find((s) => s.code === code)?.docs;
      return v == null ? '' : `<span class="pr-chip__n">${num(v)}</span>`;
    };
    const all = this.counts
      ? Object.values(this.counts.bySource).reduce((a, b) => a + b, 0)
      : this.sources.length ? this.sources.reduce((a, s) => a + s.docs, 0) : null;
    this.$('prSources').innerHTML =
      `<button type="button" class="pr-chip${sel.length ? '' : ' is-on'}" data-src="">전체${all == null ? '' : `<span class="pr-chip__n">${num(all)}</span>`}</button>` +
      Object.keys(SHORT).map((code) =>
        `<button type="button" class="pr-chip pr-chip--${code}${sel.includes(code) ? ' is-on' : ''}" data-src="${code}">${SHORT[code]}${n(code)}</button>`,
      ).join('');
  }

  // ── 검색 ─────────────────────────────────────────────────────
  private async search(recount = true): Promise<void> {
    const seq = ++this.seq;
    this.page = 1;
    this.writeUrl();
    const list = this.$('prList');
    list.innerHTML = '<div class="pr-empty">찾는 중…</div>';
    if (recount) { this.counts = null; this.renderSources(); }
    this.renderStatus();

    const q = { ...this.query, source: [...this.query.source] };
    // 건수는 본문 전체를 훑어야 해 목록보다 느리다 — 따로 세고, 오면 채운다.
    if (recount && (q.q || q.from || q.to)) {
      void pressApi.count(q).then((c) => {
        if (seq !== this.seq) return;
        this.counts = c;
        this.renderSources();
        this.renderStatus();
      }).catch(() => undefined);
    }
    try {
      const r = await pressApi.search(q, 1);
      if (seq !== this.seq) return;
      this.tokens = r.tokens;
      this.items = r.items;
      this.more = r.more;
      this.renderList();
      this.renderStatus();
    } catch (e) {
      if (seq !== this.seq) return;
      this.items = [];
      list.innerHTML = `<div class="alert alert-danger m-2">${esc(e instanceof Error ? e.message : String(e))}</div>`;
    }
  }

  private async loadMore(): Promise<void> {
    const seq = this.seq;
    const btn = document.getElementById('prMore') as HTMLButtonElement | null;
    if (btn) { btn.disabled = true; btn.textContent = '불러오는 중…'; }
    try {
      const r = await pressApi.search(this.query, this.page + 1);
      if (seq !== this.seq) return;
      this.page += 1;
      this.items = this.items.concat(r.items);
      this.more = r.more;
      this.renderList();
      this.renderStatus();
    } catch {
      if (btn) { btn.disabled = false; btn.textContent = '더 보기'; }
    }
  }

  private renderStatus(): void {
    const q = this.query;
    const parts: string[] = [];
    const filtered = !!(q.q || q.from || q.to);
    if (filtered) {
      const total = this.counts
        ? (q.source.length ? q.source : Object.keys(SHORT)).reduce((a, c) => a + (this.counts!.bySource[c] || 0), 0)
        : null;
      parts.push(total == null ? '건수 세는 중…' : `<strong>${num(total)}</strong>건`);
    } else if (this.sources.length) {
      const picked = this.sources.filter((s) => !q.source.length || q.source.includes(s.code));
      parts.push(`<strong>${num(picked.reduce((a, s) => a + s.docs, 0))}</strong>건`);
      const last = picked.map((s) => s.last || '').sort().pop();
      if (last) parts.push(`수집 ${esc(last)}까지`);
    }
    if (this.items.length) parts.push(`${num(this.items.length)}건 표시`);
    parts.push('최신순');
    if (q.q) parts.push(q.in === 'title' ? '제목·파일명에서' : q.in === 'body' ? '본문에서' : '제목·본문에서');
    this.$('prStatus').innerHTML = parts.join(' · ');
  }

  // ── 목록 ─────────────────────────────────────────────────────
  private renderList(): void {
    const list = this.$('prList');
    if (!this.items.length) {
      list.innerHTML = '<div class="pr-empty">찾은 자료가 없습니다.</div>';
      return;
    }
    // 같은 게시물의 파일(본문·별첨)이 이어 나오면 한 묶음으로.
    const groups: PressItem[][] = [];
    for (const it of this.items) {
      const g = groups[groups.length - 1];
      if (g && g[0].postKey === it.postKey) g.push(it);
      else groups.push([it]);
    }
    const searching = this.tokens.length > 0;
    list.innerHTML = groups.map((g) => {
      const h = g[0];
      const files = g.map((it) => {
        let snip: string;
        if (!it.snippet) snip = '<span class="pr-file__snip pr-file__snip--none">추출된 본문이 없습니다(스캔본 등) — 원문으로 보세요</span>';
        else if (searching && it.hit) snip = `<span class="pr-file__snip">${it.cut ? '…' : ''}${hl(it.snippet, this.tokens)}…</span>`;
        else snip = `<span class="pr-file__snip pr-file__snip--plain">${searching ? '<em>제목 일치</em> ' : ''}${esc(it.snippet)}…</span>`;
        return `<button type="button" class="pr-file${it.id === this.openId ? ' is-selected' : ''}" data-id="${it.id}">
            <span class="pr-file__name"><span class="pr-ext pr-ext--${esc(it.ext)}">${esc(it.ext.toUpperCase() || '?')}</span>${hl(it.fileName, this.tokens)}</span>
            ${snip}
          </button>`;
      }).join('');
      return `<article class="pr-post">
          <header class="pr-post__head">
            <span class="pr-src pr-src--${esc(h.source)}">${esc(SHORT[h.source] || h.source)}</span>
            <span class="pr-date">${esc(h.date || '')}</span>
            <span class="pr-post__title">${hl(h.title, this.tokens)}</span>
          </header>
          ${files}
        </article>`;
    }).join('') + (this.more ? '<button type="button" id="prMore" class="btn btn-outline-secondary btn-sm pr-more">더 보기</button>' : '');
  }

  private markSelected(): void {
    this.$('prList').querySelectorAll<HTMLElement>('.pr-file').forEach((el) => {
      el.classList.toggle('is-selected', Number(el.dataset.id) === this.openId);
    });
  }

  // ── 문서 보기 ────────────────────────────────────────────────
  private async open(id: number, scroll = true): Promise<void> {
    const seq = ++this.docSeq;
    this.openId = id;
    this.writeUrl();
    this.markSelected();
    const body = this.$('prBody');
    const viewer = this.$('prViewer');
    const wasOpen = body.classList.contains('is-open');
    // 좁은 화면에선 문서를 열면 목록이 접힌다 — 닫을 때 보던 자리로 돌아가게 기억해 둔다.
    if (!wasOpen) this.listScrollY = window.scrollY;
    body.classList.add('is-open');
    viewer.hidden = false;
    this.unmountPdf?.();
    this.unmountPdf = null;
    viewer.innerHTML = '<div class="pr-empty">여는 중…</div>';
    if (scroll && !wasOpen) body.scrollIntoView({ block: 'start' });
    try {
      const r = await pressApi.doc(id);
      if (seq !== this.docSeq) return;
      this.renderViewer(r.doc, r.files);
    } catch (e) {
      if (seq !== this.docSeq) return;
      viewer.innerHTML = `<div class="pr-viewer__bar"><span class="pr-viewer__title">문서를 열지 못했습니다</span>
        <button type="button" class="btn btn-sm btn-outline-secondary ms-auto" data-act="close">닫기</button></div>
        <div class="alert alert-danger m-2">${esc(e instanceof Error ? e.message : String(e))}</div>`;
    }
  }

  private close(): void {
    this.docSeq++;
    this.unmountPdf?.();
    this.unmountPdf = null;
    this.openId = null;
    this.writeUrl();
    this.markSelected();
    this.$('prBody').classList.remove('is-open');
    const viewer = this.$('prViewer');
    viewer.hidden = true;
    viewer.innerHTML = '';
    if (this.listScrollY != null && window.matchMedia(NARROW).matches) window.scrollTo(0, this.listScrollY);
    this.listScrollY = null;
  }

  private listScrollY: number | null = null;

  private current: { doc: PressDoc; file: PressFile | undefined } | null = null;

  private renderViewer(doc: PressDoc, files: PressFile[]): void {
    const viewer = this.$('prViewer');
    const file = files.find((f) => f.id === doc.id);
    this.current = { doc, file };
    const canOriginal = !!file && file.how !== 'none';
    const tabs = files.length > 1
      ? `<div class="pr-viewer__files">${files.map((f) =>
          `<button type="button" class="pr-tab${f.id === doc.id ? ' is-on' : ''}" data-file="${f.id}" title="${esc(f.name)}">
             <span class="pr-ext pr-ext--${esc(f.ext)}">${esc(f.ext.toUpperCase() || '?')}</span>${esc(f.name)}</button>`).join('')}</div>`
      : '';
    viewer.innerHTML = `
      <div class="pr-viewer__bar">
        <button type="button" class="btn btn-sm btn-outline-secondary pr-viewer__back" data-act="close">← 목록</button>
        <div class="pr-viewer__title" title="${esc(doc.title)}">
          <span class="pr-src pr-src--${esc(doc.source)}">${esc(SHORT[doc.source] || doc.sourceName)}</span>
          <span class="pr-date">${esc(doc.date || '')}</span>
          ${esc(doc.title)}
        </div>
        <div class="pr-viewer__tools">
          <div class="btn-group btn-group-sm" role="group" aria-label="보기 방식">
            <button type="button" class="btn btn-outline-primary" data-mode="original"${canOriginal ? '' : ' disabled'}>원문</button>
            <button type="button" class="btn btn-outline-primary" data-mode="text">텍스트</button>
          </div>
          <span class="pr-find" id="prFind" hidden></span>
          ${file && file.size ? `<a class="btn btn-sm btn-outline-secondary" href="${pressApi.rawUrl(doc.id)}" title="${esc(doc.fileName)} 내려받기"><span class="pr-long">원본 </span>받기</a>` : ''}
          ${doc.postUrl ? `<a class="btn btn-sm btn-outline-secondary" href="${esc(doc.postUrl)}" target="_blank" rel="noopener noreferrer">기관<span class="pr-long"> 게시물</span> ↗</a>` : ''}
          <button type="button" class="btn btn-sm btn-outline-secondary pr-viewer__close" data-act="close" aria-label="닫기">✕</button>
        </div>
      </div>
      ${tabs}
      <div class="pr-viewer__content" id="prContent"></div>`;
    viewer.scrollTop = 0;
    this.renderContent();
  }

  private setMode(mode: Mode): void {
    this.mode = mode;
    try { localStorage.setItem(MODE_KEY, mode); } catch { /* 저장 못 해도 그만 */ }
    this.renderContent();
  }

  private marks: HTMLElement[] = [];
  private markIdx = -1;

  private renderContent(): void {
    if (!this.current) return;
    const { doc, file } = this.current;
    const canOriginal = !!file && file.how !== 'none';
    const mode: Mode = this.mode === 'original' && canOriginal ? 'original' : 'text';
    const viewer = this.$('prViewer');
    viewer.querySelectorAll<HTMLElement>('[data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    const content = this.$('prContent');
    const find = this.$('prFind');
    this.unmountPdf?.();
    this.unmountPdf = null;
    this.marks = [];
    this.markIdx = -1;
    find.hidden = true;

    if (mode === 'original') {
      content.className = 'pr-viewer__content pr-pdf';
      this.unmountPdf = mountPdf(content, pressApi.originalUrl(doc.id), file!.how === 'convert' && !file!.ready);
      return;
    }
    content.className = 'pr-viewer__content pr-text';
    if (!doc.content.trim()) {
      content.innerHTML = `<div class="pr-empty">추출된 본문이 없습니다(스캔본이거나 추출에 실패한 파일).${canOriginal ? ' ‘원문’으로 보세요.' : ''}</div>`;
      return;
    }
    // 추출 본문엔 쪽 여백이 빈 줄 수십 개로 남아 있다 — 문단 사이 한 줄만 남긴다.
    content.innerHTML = hl(doc.content.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n'), this.tokens);
    this.marks = Array.from(content.querySelectorAll<HTMLElement>('mark'));
    if (this.tokens.length) {
      find.hidden = false;
      find.innerHTML = this.marks.length
        ? `<span class="pr-long">검색어 </span><span id="prFindPos"></span>
           <button type="button" data-jump="-1" aria-label="이전 일치">▲</button>
           <button type="button" data-jump="1" aria-label="다음 일치">▼</button>`
        : '<span title="제목·파일명만 일치">본문 일치 없음</span>';
      if (this.marks.length) this.jump(1);
    }
  }

  /** 텍스트 보기에서 다음/이전 일치로. */
  private jump(step: number): void {
    if (!this.marks.length) return;
    this.marks[this.markIdx]?.classList.remove('is-cur');
    this.markIdx = (this.markIdx + step + this.marks.length) % this.marks.length;
    const m = this.marks[this.markIdx];
    m.classList.add('is-cur');
    m.scrollIntoView({ block: 'center' });
    const pos = document.getElementById('prFindPos');
    if (pos) pos.textContent = `${this.markIdx + 1}/${this.marks.length}`;
  }
}
