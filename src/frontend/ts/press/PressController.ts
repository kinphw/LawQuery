import { Header } from '../common/components/Header';
import { pressApi, PressDoc, PressFile, PressItem, PressQuery, PressSource } from './PressApi';
import { mountPdf, PdfHandle, PdfHits } from './PdfView';

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
  private query: PressQuery = { q: '', in: 'all', phrase: false, source: [], from: '', to: '' };
  private tokens: string[] = [];
  private items: PressItem[] = [];
  private page = 1;
  private more = false;
  private sources: PressSource[] = [];
  private counts: { total: number; bySource: Record<string, number> } | null = null;
  private openId: number | null = null;
  private seq = 0;
  private docSeq = 0;
  private pdf: PdfHandle | null = null;
  /** 문서 창의 찾기 칸에 직접 넣은 말(null 이면 검색어를 그대로 쓴다). 문서 창을 닫거나 새로 검색하면 지운다. */
  private findQ: string | null = null;

  /** 문서 안에서 표시·이동할 말 */
  private docTokens(): string[] {
    return this.findQ == null ? this.tokens : this.findQ ? [this.findQ] : [];
  }
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
      phrase: sp.get('ph') === '1',
      source: (sp.get('src') || '').split(',').filter((s) => s in SHORT),
      from: sp.get('from') || '',
      to: sp.get('to') || '',
    };
    const open = parseInt(sp.get('open') || '', 10);
    this.openId = Number.isFinite(open) ? open : null;
    this.$<HTMLInputElement>('prQ').value = this.query.q;
    this.$<HTMLSelectElement>('prIn').value = this.query.in;
    this.$<HTMLInputElement>('prPhrase').checked = this.query.phrase;
    this.$<HTMLInputElement>('prFrom').value = this.query.from;
    this.$<HTMLInputElement>('prTo').value = this.query.to;
  }

  private writeUrl(): void {
    const sp = new URLSearchParams();
    const q = this.query;
    if (q.q) sp.set('q', q.q);
    if (q.in !== 'all') sp.set('in', q.in);
    if (q.phrase) sp.set('ph', '1');
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
      this.query.phrase = this.$<HTMLInputElement>('prPhrase').checked;
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

    // 문서 안 찾기 — 원문(PDF)·텍스트 양쪽에 같은 칸
    this.$('prViewer').addEventListener('submit', (e) => {
      if (!(e.target as HTMLElement).closest('#prFind')) return;
      e.preventDefault();
      this.findQ = (document.getElementById('prFindQ') as HTMLInputElement).value.trim();
      if (this.pdf) this.pdf.find(this.docTokens());
      else this.renderContent();
    });

    this.$('prViewer').addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-act="close"]')) { this.close(); return; }
      const m = t.closest<HTMLElement>('[data-mode]');
      if (m) { this.setMode(m.dataset.mode as Mode); return; }
      const f = t.closest<HTMLElement>('[data-file]');
      if (f) { void this.open(Number(f.dataset.file)); return; }
      const j = t.closest<HTMLElement>('[data-jump]');
      if (j) { if (this.pdf) this.pdf.go(Number(j.dataset.jump)); else this.jump(Number(j.dataset.jump)); }
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
      return v == null ? '' : ` <small>${num(v)}</small>`;
    };
    const btn = (code: string, label: string, on: boolean) =>
      `<button type="button" class="btn btn-sm btn-outline-dark${on ? ' active' : ''}" data-src="${code}" aria-pressed="${on}">${label}</button>`;
    const all = this.counts
      ? Object.values(this.counts.bySource).reduce((a, b) => a + b, 0)
      : this.sources.length ? this.sources.reduce((a, s) => a + s.docs, 0) : null;
    this.$('prSources').innerHTML =
      btn('', `전체${all == null ? '' : ` <small>${num(all)}</small>`}`, !sel.length) +
      Object.keys(SHORT).map((code) => btn(code, `${SHORT[code]}${n(code)}`, sel.includes(code))).join('');
  }

  // ── 검색 ─────────────────────────────────────────────────────
  private async search(recount = true): Promise<void> {
    const seq = ++this.seq;
    this.page = 1;
    this.findQ = null;
    this.expanded.clear();
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
    if (q.q && q.phrase) parts.push('문구 그대로');
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
    // 한 줄 = 게시물(게시일·기관·제목). 제목을 누르면 본문 파일이 열린다.
    // 파일 줄: 훑어볼 땐 파일명만(본문·별첨이 여럿일 때), 검색 중엔 본문에 걸린 파일만 미리보기와 함께.
    const searching = this.tokens.length > 0;
    const isAnnex = (n: string) => /별첨|붙임|참고자료|첨부/.test(n);
    // 생김새는 유권해석 결과표와 같은 Bootstrap 표(table-bordered·table-light 머리줄) — LQ 의 톤을 따른다.
    list.innerHTML = `<table class="table table-bordered table-hover pr-table">
        <thead class="table-light"><tr>
          <th class="text-center text-nowrap pr-table__src">기관</th>
          <th class="text-center">제목</th>
          <th class="text-center text-nowrap pr-table__date">게시일</th>
        </tr></thead><tbody>` + groups.map((g) => {
      const files = [...g].sort((a, b) => Number(isAnnex(a.fileName)) - Number(isAnnex(b.fileName)));
      const h = files[0];
      // 게시물을 한 번 열면 그 게시물의 파일 전부(걸리지 않은 별첨 포함)가 펼쳐진다 — open() 이 채운다.
      const all = this.expanded.get(h.postKey);
      const shown: { id: number; name: string; item?: PressItem }[] = all
        ? all.map((f) => ({ id: f.id, name: f.name, item: files.find((it) => it.id === f.id) }))
        : (searching ? files.filter((it) => it.hit && it.snippet) : files).map((it) => ({ id: it.id, name: it.fileName, item: it }));
      // 훑어볼 땐 파일명만(미리보기 없이). 파일이 하나뿐이면 제목과 같은 말이라 줄을 달지 않는다.
      const lines = (shown.length < 2 && !searching ? [] : shown).map((f) => {
        const it = f.item;
        const snip = searching && it && it.hit && it.snippet
          ? `<span class="pr-file__snip">${it.cut ? '…' : ''}${hl(it.snippet, this.tokens)}…</span>` : '';
        return `<button type="button" class="pr-file${f.id === this.openId ? ' is-selected' : ''}" data-id="${f.id}">
            <span class="pr-file__name"><i class="fas fa-paperclip"></i>${hl(f.name, this.tokens)}</span>${snip}
          </button>`;
      }).join('');
      const hasOwnLine = lines && shown.some((f) => f.id === h.id);
      return `<tr class="pr-row${h.id === this.openId && !hasOwnLine ? ' table-active' : ''}" data-id="${h.id}">
          <td class="text-center text-nowrap pr-src pr-src--${esc(h.source)}">${esc(SHORT[h.source] || h.source)}</td>
          <td class="pr-row__main">
            <div class="pr-row__title">${hl(h.title, this.tokens)}</div>
            ${lines}
          </td>
          <td class="text-center text-nowrap pr-date">${esc(h.date || '')}</td>
        </tr>`;
    }).join('') + '</tbody></table>'
      + (this.more ? '<button type="button" id="prMore" class="btn btn-outline-secondary btn-sm pr-more">더 보기</button>' : '');
  }

  private markSelected(): void {
    this.$('prList').querySelectorAll<HTMLElement>('[data-id]').forEach((el) => {
      const on = Number(el.dataset.id) === this.openId;
      if (el.classList.contains('pr-row')) {
        // 게시물 줄은 그 파일의 줄이 따로 펼쳐져 있으면 칠하지 않는다(같은 파일을 두 번 칠하지 않게)
        el.classList.toggle('table-active', on && !el.querySelector(`.pr-file[data-id="${el.dataset.id}"]`));
      } else {
        el.classList.toggle('is-selected', on);
      }
    });
  }

  /** 연 게시물의 파일 전부 — 목록에서 그 게시물 아래에 펼쳐 보인다(검색에 걸리지 않은 별첨까지). */
  private expanded = new Map<string, PressFile[]>();

  private expandPost(files: PressFile[]): void {
    const ids = new Set(files.map((f) => f.id));
    const key = this.items.find((it) => ids.has(it.id))?.postKey;
    if (!key) return;
    this.expanded.set(key, files);
    const list = this.$('prList');
    const top = list.scrollTop;
    this.renderList();
    list.scrollTop = top;
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
    // 넓은 화면에선 문서를 여는 동안 페이지 스크롤을 없앤다(목록·문서 두 칸만 스크롤) — SCSS 의 body.pr-reading
    document.body.classList.add('pr-reading');
    viewer.hidden = false;
    this.pdf?.destroy();
    this.pdf = null;
    viewer.innerHTML = '<div class="pr-empty">여는 중…</div>';
    if (scroll && !wasOpen && window.matchMedia(NARROW).matches) body.scrollIntoView({ block: 'start' });
    try {
      const r = await pressApi.doc(id);
      if (seq !== this.docSeq) return;
      this.expandPost(r.files);
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
    this.pdf?.destroy();
    this.pdf = null;
    this.openId = null;
    this.findQ = null;
    this.writeUrl();
    this.markSelected();
    this.$('prBody').classList.remove('is-open');
    document.body.classList.remove('pr-reading');
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
          `<button type="button" class="btn btn-sm btn-outline-secondary pr-tab${f.id === doc.id ? ' active' : ''}" data-file="${f.id}" title="${esc(f.name)}">
             ${esc(f.name)}</button>`).join('')}</div>`
      : '';
    viewer.innerHTML = `
      <div class="pr-viewer__bar">
        <button type="button" class="btn btn-sm btn-outline-secondary pr-viewer__back" data-act="close">← 목록</button>
        <div class="pr-viewer__title" title="${esc(doc.title)}">
          <span class="pr-viewer__meta">${esc(SHORT[doc.source] || doc.sourceName)} · ${esc(doc.date || '')}</span>
          ${esc(doc.title)}
        </div>
        <div class="pr-viewer__tools">
          <div class="btn-group btn-group-sm" role="group" aria-label="보기 방식">
            <button type="button" class="btn btn-outline-primary" data-mode="original"${canOriginal ? '' : ' disabled'}>원문</button>
            <button type="button" class="btn btn-outline-primary" data-mode="text">텍스트</button>
          </div>
          <form class="pr-find" id="prFind" role="search">
            <input type="search" id="prFindQ" class="form-control form-control-sm" placeholder="문서 안 찾기" aria-label="문서 안 찾기"
              value="${esc(this.findQ ?? (this.query.phrase ? this.query.q : this.tokens[0] ?? ''))}" />
            <span class="pr-find__pos" id="prFindPos"></span>
            <button type="button" data-jump="-1" aria-label="이전 일치">▲</button>
            <button type="button" data-jump="1" aria-label="다음 일치">▼</button>
          </form>
          ${file && file.size ? `<a class="btn btn-sm btn-outline-secondary" href="${pressApi.rawUrl(doc.id)}" title="${esc(doc.fileName)} 내려받기"><span class="pr-long">원본 </span>받기</a>` : ''}
          ${file && !file.size && doc.fileUrl ? `<a class="btn btn-sm btn-outline-secondary" href="${esc(doc.fileUrl)}" target="_blank" rel="noopener noreferrer" title="이 PC 에 원문 파일이 없어 기관 사이트에서 받습니다">기관<span class="pr-long">에서</span> 받기 ↗</a>` : ''}
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
    const pos = this.$('prFindPos');
    const tokens = this.docTokens();
    this.pdf?.destroy();
    this.pdf = null;
    this.marks = [];
    this.markIdx = -1;
    pos.textContent = '';

    if (mode === 'original') {
      content.className = 'pr-viewer__content pr-pdf';
      this.pdf = mountPdf(content, pressApi.originalUrl(doc.id), file!.how === 'convert' && !file!.ready, tokens,
        (h: PdfHits) => {
          pos.textContent = !h.active ? '' : h.total ? `${h.idx + 1}/${h.total}쪽${h.scanned ? '' : '…'}` : h.scanned ? '없음' : '찾는 중…';
        });
      return;
    }
    content.className = 'pr-viewer__content pr-text';
    // 원문 파일이 이 PC 에 없는 수집분(행만 넘어온 경우) — 왜 '원문'이 꺼져 있는지 알린다
    const missing = file && !file.size
      ? '<div class="alert alert-warning py-2 small mb-3" style="white-space:normal">이 자료는 원문 파일이 이 PC 에 없어 텍스트로만 볼 수 있습니다.</div>' : '';
    if (!doc.content.trim()) {
      content.innerHTML = `<div class="pr-empty">추출된 본문이 없습니다(스캔본이거나 추출에 실패한 파일).${canOriginal ? ' ‘원문’으로 보세요.' : ''}</div>`;
      return;
    }
    // 추출 본문엔 쪽 여백이 빈 줄 수십 개로 남아 있다 — 문단 사이 한 줄만 남긴다.
    content.innerHTML = missing + hl(doc.content.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n'), tokens);
    this.marks = Array.from(content.querySelectorAll<HTMLElement>('mark'));
    if (tokens.length) {
      if (this.marks.length) this.jump(1);
      else pos.textContent = '없음';
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
    this.$('prFindPos').textContent = `${this.markIdx + 1}/${this.marks.length}`;
  }
}
