import { Header } from '../common/components/Header';
import { pressApi, PressDoc, PressFile, PressItem, PressQuery, PressSource } from './PressApi';
import { mountPdf, PdfHandle, PdfHits } from './PdfView';

const SHORT: Record<string, string> = { fsc: '금융위', fss: '금감원', moef: '기재부', bok: '한은' };
const PRESS_NAME: Record<string, string> = { fsc: '금융위원회', fss: '금융감독원', moef: '기획재정부', bok: '한국은행' };
const MODE_KEY = 'lq:press:mode';
const VIEW_KEY = 'lq:press:view';

/** 최근 게시물 표시: 3일 안이면 'r3'(점 + 진한 날짜), 7일 안이면 'r7'(진한 날짜). 날짜 칸의 클래스 꼬리로 쓴다. */
function recency(date: string | null): '' | 'r3' | 'r7' {
  if (!date) return '';
  const days = Math.floor((Date.now() - new Date(`${date}T00:00:00`).getTime()) / 86400000);
  return days < 0 ? '' : days <= 3 ? 'r3' : days <= 7 ? 'r7' : '';
}
const dateClass = (date: string | null) => { const r = recency(date); return r ? ` pr-date--${r}` : ''; };
const dateTip = (date: string | null) => { const r = recency(date); return r === 'r3' ? ' title="최근 3일"' : r === 'r7' ? ' title="최근 1주일"' : ''; };
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

    try {
      if (localStorage.getItem(MODE_KEY) === 'text') this.mode = 'text';
      if (localStorage.getItem(VIEW_KEY) === 'board') this.view = 'board';
    } catch { /* 저장소를 못 써도 그만 */ }
    this.readUrl();
    this.bind();
    this.renderSources();
    void pressApi.sources().then((r) => {
      this.sources = r.sources;
      this.renderSources();
      Object.keys(this.board).forEach((code) => this.renderBoardCol(code)); // 칸 머리의 건수·수집일
    }).catch(() => undefined);
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

    this.$('prView').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-view]');
      if (!b || b.dataset.view === this.view) return;
      this.view = b.dataset.view === 'board' ? 'board' : 'list';
      // 기관별은 네 기관을 다 놓는다 — 기관 단추가 접히므로 골라 둔 기관은 푼다
      if (this.view === 'board' && this.query.source.length) { this.query.source = []; this.renderSources(); }
      try { localStorage.setItem(VIEW_KEY, this.view); } catch { /* 저장 못 해도 그만 */ }
      void this.search(false);
    });

    this.$('prBoard').addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const more = t.closest<HTMLElement>('[data-more]');
      if (more) { void this.loadBoardMore(more.dataset.more!); return; }
      const row = t.closest<HTMLElement>('[data-id]');
      if (!row) return;
      // 문서를 여는 동안 왼쪽 목록은 누른 기관의 목록으로
      this.listOverride = row.closest<HTMLElement>('[data-col]')?.dataset.col ?? null;
      this.renderList();
      void this.open(Number(row.dataset.id));
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

  // ── 보드: 기관별 최신 게시물을 나란히 ─────────────────────────
  // 검색어 없이 훑어볼 때의 첫 화면(넓은 화면). 네 기관을 한 줄 목록에 섞지 않고 칸으로 나눠, 기관마다 최근에
  // 무엇을 냈는지 한눈에 보게 한다. 검색하면 한 줄 목록(미리보기 포함)으로 바뀐다. 좁은 화면은 늘 한 줄 목록.
  private board: Record<string, { items: PressItem[]; page: number; more: boolean }> = {};
  /** 보드에서 연 게시물의 기관 — 문서를 여는 동안 왼쪽 목록은 그 기관의 목록을 보인다 */
  private listOverride: string | null = null;
  /** 보는 방식 — 기본은 일괄(한 목록). 기관별(보드)은 고른 사람만 */
  private view: 'list' | 'board' = 'list';

  private boardSources(): string[] {
    return this.query.source.length ? this.query.source : Object.keys(SHORT);
  }

  /** 기관별 보기를 고를 수 있는 조건: 검색어가 없고, 기관을 하나만 고른 게 아닐 때(하나면 그 기관의 한 줄 목록이 낫다). */
  private canBoard(): boolean {
    return !this.query.q && this.query.source.length !== 1;
  }

  private wantsBoard(): boolean {
    return this.view === 'board' && this.canBoard();
  }

  private renderViewToggle(): void {
    const wrap = document.querySelector('.pr-wrap');
    wrap?.classList.toggle('can-board', this.canBoard());
    // 기관별로 볼 땐 위쪽 기관 단추가 칸 머리와 같은 말이라 접는다(SCSS: 넓은 화면에서만)
    wrap?.classList.toggle('is-board', this.wantsBoard());
    this.$('prView').querySelectorAll<HTMLElement>('[data-view]').forEach((b) => {
      b.classList.toggle('active', b.dataset.view === this.view);
    });
  }

  /** 지금 왼쪽 목록에 깔린 항목들 */
  private listItems(): PressItem[] {
    return this.listOverride && this.board[this.listOverride] ? this.board[this.listOverride].items : this.items;
  }

  private async loadBoard(seq: number): Promise<void> {
    const host = this.$('prBoard');
    const codes = this.boardSources();
    host.style.gridTemplateColumns = `repeat(${codes.length}, minmax(0, 1fr))`;
    host.innerHTML = codes.map((c) => `<section class="pr-col" data-col="${c}"><div class="pr-empty">불러오는 중…</div></section>`).join('');
    await Promise.all(codes.map(async (code) => {
      try {
        const r = await pressApi.search({ ...this.query, source: [code] }, 1);
        if (seq !== this.seq) return;
        this.board[code] = { items: r.items, page: 1, more: r.more };
      } catch {
        if (seq !== this.seq) return;
        this.board[code] = { items: [], page: 1, more: false };
      }
      this.renderBoardCol(code);
    }));
  }

  private renderBoardCol(code: string): void {
    const col = this.$('prBoard').querySelector<HTMLElement>(`[data-col="${code}"]`);
    const b = this.board[code];
    if (!col || !b) return;
    // 같은 게시물의 파일(본문·별첨)은 한 줄로 — 본문 파일이 열린다
    const posts: PressItem[][] = [];
    for (const it of b.items) {
      const g = posts[posts.length - 1];
      if (g && g[0].postKey === it.postKey) g.push(it);
      else posts.push([it]);
    }
    const isAnnex = (n: string) => /별첨|붙임|참고자료|첨부/.test(n);
    const stat = this.sources.find((x) => x.code === code);
    let lastDate = '';
    const rows = posts.map((g) => {
      const h = [...g].sort((x, y) => Number(isAnnex(x.fileName)) - Number(isAnnex(y.fileName)))[0];
      // 날짜는 바뀔 때만 적는다(같은 날 게시물이 여럿이면 되풀이하지 않는다)
      const d = h.date || '';
      const showDate = d !== lastDate;
      lastDate = d;
      return `<button type="button" class="pr-col__row${h.id === this.openId ? ' is-selected' : ''}" data-id="${h.id}" title="${esc(h.title)}">
          <span class="pr-col__date${dateClass(h.date)}"${dateTip(h.date)}>${showDate ? esc(d.slice(5)) : ''}</span>
          <span class="pr-col__title">${esc(h.title)}${g.length > 1 ? `<span class="pr-col__n"><i class="fas fa-paperclip"></i>${g.length}</span>` : ''}</span>
        </button>`;
    }).join('');
    col.innerHTML = `
      <header class="pr-col__head">
        <span class="pr-src pr-src--${code}">${esc(PRESS_NAME[code] || code)}</span>
        ${stat ? `<span class="pr-col__meta">${num(stat.posts)}건 · ${esc(stat.last || '')}까지</span>` : ''}
      </header>
      ${rows || '<div class="pr-empty">게시물이 없습니다.</div>'}
      ${b.more ? `<button type="button" class="btn btn-sm btn-outline-secondary pr-col__more" data-more="${code}">더 보기</button>` : ''}`;
  }

  private async loadBoardMore(code: string): Promise<void> {
    const b = this.board[code];
    if (!b) return;
    const seq = this.seq;
    try {
      const r = await pressApi.search({ ...this.query, source: [code] }, b.page + 1);
      if (seq !== this.seq) return;
      b.page += 1;
      b.items = b.items.concat(r.items);
      b.more = r.more;
      this.renderBoardCol(code);
    } catch { /* 그대로 둔다 — 다시 누르면 된다 */ }
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

    // 검색어 없이 훑어볼 땐 보드(넓은 화면에서만 보인다 — SCSS 의 .has-board)
    this.renderViewToggle();
    const boardOn = this.wantsBoard();
    this.board = {};
    this.listOverride = null;
    this.$('prBody').classList.toggle('has-board', boardOn);
    if (boardOn) void this.loadBoard(seq);
    else this.$('prBoard').innerHTML = '';

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
    // 보드로 볼 땐 칸마다 따로 내려오므로 '몇 건 표시'가 뜻이 없다
    if (this.items.length && !this.wantsBoard()) parts.push(`${num(this.items.length)}건 표시`);
    parts.push('최신순');
    if (q.q && q.phrase) parts.push('문구 그대로');
    if (q.q) parts.push(q.in === 'title' ? '제목·파일명에서' : q.in === 'body' ? '본문에서' : '제목·본문에서');
    this.$('prStatus').innerHTML = parts.join(' · ');
  }

  // ── 목록 ─────────────────────────────────────────────────────
  private renderList(): void {
    const list = this.$('prList');
    const items = this.listItems();
    if (!items.length) {
      list.innerHTML = '<div class="pr-empty">찾은 자료가 없습니다.</div>';
      return;
    }
    // 같은 게시물의 파일(본문·별첨)이 이어 나오면 한 묶음으로.
    const groups: PressItem[][] = [];
    for (const it of items) {
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
          <td class="text-center text-nowrap pr-date${dateClass(h.date)}"${dateTip(h.date)}>${esc(h.date || '')}</td>
        </tr>`;
    }).join('') + '</tbody></table>'
      + (this.more && !this.listOverride ? '<button type="button" id="prMore" class="btn btn-outline-secondary btn-sm pr-more">더 보기</button>' : '');
  }

  private markSelected(): void {
    this.$('prBoard').querySelectorAll<HTMLElement>('[data-id]').forEach((el) => {
      el.classList.toggle('is-selected', Number(el.dataset.id) === this.openId);
    });
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
    const key = this.listItems().find((it) => ids.has(it.id))?.postKey;
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
    if (this.listOverride) { this.listOverride = null; this.renderList(); }
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
      <div class="pr-viewer__content" id="prContent"></div>
      <!-- 좁은 화면: 긴 문서를 읽다가도 엄지로 닿는 자리에서 목록으로 -->
      <button type="button" class="btn btn-dark pr-fab" data-act="close"><i class="fas fa-list"></i> 목록</button>`;
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
