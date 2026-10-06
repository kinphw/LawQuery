import { Header } from '../common/components/Header';
import { precApi, PrecDetail, PrecItem, PrecQuery, PrecSrc } from './PrecApi';
import { courtClass, courtName, esc, hl, renderPrecCase, renderPrecSections } from './PrecView';

type Src = 'all' | PrecSrc;
const SRC_LABEL: Record<Src, string> = { all: '전체', prec: '판례', detc: '헌재결정' };
const SHORT_COURT: Record<string, string> = { sc: '대법원', cc: '헌재' };
/** 본문을 열면 목록을 접는 폭 — assets/scss/press/_base.scss 의 미디어 쿼리와 같은 값(틀을 같이 쓴다). */
const NARROW = '(max-width: 991.98px)';
const EXAMPLES = ['접근매체 양도', '전자금융거래법 제9조', '선불전자지급수단', '2013다69989', '2020헌바583'];

const num = (n: number) => n.toLocaleString('ko-KR');

/**
 * 판례 — 법원 판례와 헌법재판소 결정을 한 검색창으로(법제처 API 실시간 조회, DB 적재 없음).
 * 화면 상태(검색 조건·연 판례)는 URL 쿼리에 둔다: q, in, ph, src, open.
 * 틀(검색줄·목록|문서 두 칸·읽기 모드)은 기관 보도자료의 .pr-* 를 그대로 쓰고, 목록·본문 조각은 PrecView.
 */
export class PrecController {
  private q = '';
  private where: 'body' | 'title' = 'body';
  private phrase = false;
  private src: Src = 'all';
  /** 서버가 실제로 찾은 곳(사건번호 꼴이면 title 로 바뀐다) */
  private usedIn: 'body' | 'title' = 'body';

  private items: PrecItem[] = [];
  private total = 0;
  private more = false;
  private page = 1;
  /** 출처별 건수 — '전체'로 찾았을 때의 것(단추에 적는다) */
  private counts: Partial<Record<PrecSrc, number>> | null = null;
  private error = '';

  private openId: string | null = null;
  private doc: PrecDetail | null = null;
  /** 본문 창의 찾기 칸에 직접 넣은 말(null 이면 검색어를 그대로 쓴다) */
  private findQ: string | null = null;
  private marks: HTMLElement[] = [];
  private markIdx = -1;
  private listScrollY: number | null = null;

  private seq = 0;
  private docSeq = 0;

  private $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

  async initialize(): Promise<void> {
    const header = new Header();
    this.$('header').innerHTML = header.render('prec');
    header.setInfoButtonHandler();

    this.readUrl();
    this.bind();
    this.renderSources();
    await this.search();
    if (this.openId) void this.open(this.openId);
  }

  // ── URL ↔ 상태 ───────────────────────────────────────────────
  private readUrl(): void {
    const sp = new URLSearchParams(location.search);
    this.q = (sp.get('q') || '').trim();
    this.where = sp.get('in') === 'title' ? 'title' : 'body';
    this.phrase = sp.get('ph') === '1';
    const s = sp.get('src');
    this.src = s === 'prec' || s === 'detc' ? s : 'all';
    this.openId = /^c?\d+$/.test(sp.get('open') || '') ? sp.get('open') : null;
    this.$<HTMLInputElement>('pcQ').value = this.q;
    this.$<HTMLSelectElement>('pcIn').value = this.where;
    this.$<HTMLInputElement>('pcPhrase').checked = this.phrase;
  }

  private writeUrl(): void {
    const sp = new URLSearchParams();
    if (this.q) sp.set('q', this.q);
    if (this.where !== 'body') sp.set('in', this.where);
    if (this.phrase) sp.set('ph', '1');
    if (this.src !== 'all') sp.set('src', this.src);
    if (this.openId) sp.set('open', this.openId);
    const s = sp.toString();
    history.replaceState(null, '', s ? `${location.pathname}?${s}` : location.pathname);
  }

  /** API 에 넘길 조건. '문구 그대로'는 큰따옴표로 묶어 보낸다(법제처 API 의 문구 검색). */
  private query(src: Src = this.src): PrecQuery {
    const bare = this.q.replace(/"/g, ' ').replace(/\s+/g, ' ').trim();
    return { q: this.phrase && bare ? `"${bare}"` : this.q, in: this.where, src };
  }

  /** 목록·본문에서 형광 표시할 말 */
  private tokens(): string[] {
    const bare = this.q.replace(/"/g, ' ').replace(/\s+/g, ' ').trim();
    if (!bare) return [];
    return this.phrase || /^".*"$/.test(this.q.trim()) ? [bare] : bare.split(' ').filter((t) => t.length >= 2);
  }

  private docTokens(): string[] {
    return this.findQ == null ? this.tokens() : this.findQ ? [this.findQ] : [];
  }

  // ── 이벤트 ───────────────────────────────────────────────────
  private bind(): void {
    this.$<HTMLFormElement>('pcForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.q = this.$<HTMLInputElement>('pcQ').value.trim();
      this.where = this.$<HTMLSelectElement>('pcIn').value === 'title' ? 'title' : 'body';
      this.phrase = this.$<HTMLInputElement>('pcPhrase').checked;
      this.counts = null;
      void this.search();
    });

    this.$('pcSources').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-src]');
      if (!b || b.dataset.src === this.src) return;
      this.src = b.dataset.src as Src;
      this.renderSources();
      void this.search();
    });

    this.$('pcList').addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('#pcMore')) { void this.loadMore(); return; }
      const ex = t.closest<HTMLElement>('[data-example]');
      if (ex) {
        this.$<HTMLInputElement>('pcQ').value = ex.dataset.example!;
        this.$<HTMLFormElement>('pcForm').requestSubmit();
        return;
      }
      const row = t.closest<HTMLElement>('[data-id]');
      if (row) void this.open(row.dataset.id!);
    });

    const viewer = this.$('pcViewer');
    viewer.addEventListener('submit', (e) => {
      e.preventDefault();
      this.findQ = (document.getElementById('pcFindQ') as HTMLInputElement).value.trim();
      this.renderDoc();
    });
    viewer.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-act="close"]')) { this.close(); return; }
      const j = t.closest<HTMLElement>('[data-jump]');
      if (j) this.jump(Number(j.dataset.jump));
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.openId && !document.querySelector('.modal.show')) this.close();
    });
  }

  // ── 출처 단추 ────────────────────────────────────────────────
  private renderSources(): void {
    const c = this.counts;
    const n = (s: Src): string => {
      if (!c) return '';
      const v = s === 'all' ? (c.prec ?? 0) + (c.detc ?? 0) : c[s];
      return v == null ? '' : ` <small>${num(v)}</small>`;
    };
    this.$('pcSources').innerHTML = (['all', 'prec', 'detc'] as Src[]).map((s) =>
      `<button type="button" class="btn btn-sm btn-outline-dark${s === this.src ? ' active' : ''}" data-src="${s}" aria-pressed="${s === this.src}">${SRC_LABEL[s]}${n(s)}</button>`).join('');
  }

  // ── 검색 ─────────────────────────────────────────────────────
  private async search(): Promise<void> {
    const seq = ++this.seq;
    this.page = 1;
    this.findQ = null;
    this.error = '';
    this.writeUrl();
    const list = this.$('pcList');
    if (!this.q) {
      this.items = [];
      this.total = 0;
      this.more = false;
      this.counts = null;
      this.renderSources();
      this.renderStatus();
      list.innerHTML = `<div class="pr-empty">
          <p class="mb-2">법원 판례와 헌법재판소 결정을 한 번에 찾습니다. 낱말, 조문(전자금융거래법 제9조), 사건번호 어느 것이든 넣으세요.</p>
          <div class="pc-examples">${EXAMPLES.map((x) => `<button type="button" class="btn btn-sm btn-outline-secondary" data-example="${esc(x)}">${esc(x)}</button>`).join('')}</div>
        </div>`;
      return;
    }
    list.innerHTML = '<div class="pr-empty">찾는 중…</div>';
    this.$('pcStatus').textContent = '';

    // 출처를 하나로 좁혀 찾을 때도 단추의 건수는 '전체' 기준으로 채운다(서버 캐시가 있어 가볍다)
    if (this.src !== 'all' && !this.counts) {
      void precApi.search(this.query('all'), 1).then((r) => {
        if (seq !== this.seq) return;
        this.counts = r.counts;
        this.renderSources();
      }).catch(() => undefined);
    }
    try {
      const r = await precApi.search(this.query(), 1);
      if (seq !== this.seq) return;
      this.items = r.items;
      this.total = r.total;
      this.more = r.more;
      this.usedIn = r.in;
      if (this.src === 'all') this.counts = r.counts;
    } catch (e) {
      if (seq !== this.seq) return;
      this.items = [];
      this.total = 0;
      this.more = false;
      this.error = e instanceof Error ? e.message : String(e);
    }
    this.renderSources();
    this.renderList();
    this.renderStatus();
  }

  private async loadMore(): Promise<void> {
    const seq = this.seq;
    const btn = document.getElementById('pcMore') as HTMLButtonElement | null;
    if (btn) { btn.disabled = true; btn.textContent = '불러오는 중…'; }
    try {
      const r = await precApi.search(this.query(), this.page + 1);
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
    if (!this.q || this.error) { this.$('pcStatus').innerHTML = ''; return; }
    const parts = [`<strong>${num(this.total)}</strong>건`];
    if (this.items.length && this.items.length < this.total) parts.push(`${num(this.items.length)}건 표시`);
    parts.push('최신순');
    if (this.usedIn === 'title') parts.push(this.where === 'title' ? '사건명·사건번호에서' : '사건번호로 찾음');
    else parts.push(this.phrase ? '본문에서 문구 그대로' : '본문에서');
    parts.push('법제처 제공');
    this.$('pcStatus').innerHTML = parts.join(' · ');
  }

  // ── 목록 ─────────────────────────────────────────────────────
  private renderList(): void {
    const list = this.$('pcList');
    if (this.error) {
      list.innerHTML = `<div class="alert alert-danger m-2">${esc(this.error)}</div>`;
      return;
    }
    if (!this.items.length) {
      list.innerHTML = `<div class="pr-empty">찾은 판례가 없습니다.${this.usedIn === 'body' && !this.phrase ? '' : ' 찾을 곳을 ‘본문’으로, ‘문구 그대로’를 끄고 다시 찾아 보세요.'}</div>`;
      return;
    }
    const marks = this.usedIn === 'title' ? this.tokens() : [];
    // 생김새는 유권해석·보도자료 결과표와 같은 Bootstrap 표. 한 줄 = 사건(법원 | 사건명·사건번호 | 선고일).
    list.innerHTML = `<table class="table table-bordered table-hover pr-table pc-table">
        <thead class="table-light"><tr>
          <th class="text-center text-nowrap pc-table__court">법원</th>
          <th class="text-center">사건</th>
          <th class="text-center text-nowrap pr-table__date">선고일</th>
        </tr></thead><tbody>` + this.items.map((it) => {
      const cls = courtClass(it);
      return `<tr class="pr-row${it.id === this.openId ? ' table-active' : ''}" data-id="${esc(it.id)}">
          <td class="text-center pr-src pc-src pc-src--${cls}" title="${esc(courtName(it))}">${esc(SHORT_COURT[cls] || courtName(it))}</td>
          <td class="pr-row__main">
            <div class="pr-row__title">${hl(it.title || '(사건명 없음)', marks)}</div>
            <div class="pc-row__meta">${hl(it.caseNo, marks)}${it.kind ? ` · ${esc(it.kind)}` : ''}${it.type ? ` · ${esc(it.type)}` : ''}</div>
          </td>
          <td class="text-center text-nowrap pr-date">${esc(it.date)}</td>
        </tr>`;
    }).join('') + '</tbody></table>'
      + (this.more ? '<button type="button" id="pcMore" class="btn btn-outline-secondary btn-sm pr-more">더 보기</button>' : '');
  }

  private markSelected(): void {
    this.$('pcList').querySelectorAll<HTMLElement>('tr[data-id]').forEach((el) => {
      el.classList.toggle('table-active', el.dataset.id === this.openId);
    });
  }

  // ── 본문 ─────────────────────────────────────────────────────
  private async open(id: string): Promise<void> {
    const seq = ++this.docSeq;
    this.openId = id;
    this.doc = null;
    this.writeUrl();
    this.markSelected();
    const body = this.$('pcBody');
    const viewer = this.$('pcViewer');
    const wasOpen = body.classList.contains('is-open');
    // 좁은 화면에선 본문을 열면 목록이 접힌다 — 닫을 때 보던 자리로 돌아가게 기억해 둔다.
    if (!wasOpen) this.listScrollY = window.scrollY;
    body.classList.add('is-open');
    // 넓은 화면에선 읽는 동안 페이지 스크롤을 없앤다(목록·본문 두 칸만 스크롤) — press/_base.scss 의 body.pr-reading
    document.body.classList.add('pr-reading');
    viewer.hidden = false;
    viewer.innerHTML = '<div class="pr-empty">여는 중…</div>';
    if (!wasOpen && window.matchMedia(NARROW).matches) body.scrollIntoView({ block: 'start' });
    try {
      const d = await precApi.detail(id);
      if (seq !== this.docSeq) return;
      this.doc = d;
      this.renderViewer();
    } catch (e) {
      if (seq !== this.docSeq) return;
      viewer.innerHTML = `<div class="pr-viewer__bar"><span class="pr-viewer__title">판례를 열지 못했습니다</span>
        <a class="btn btn-sm btn-outline-secondary" href="${precApi.publicUrl(id)}" target="_blank" rel="noopener noreferrer">법령정보센터 ↗</a>
        <button type="button" class="btn btn-sm btn-outline-secondary" data-act="close">닫기</button></div>
        <div class="alert alert-danger m-2">${esc(e instanceof Error ? e.message : String(e))}</div>`;
    }
  }

  private close(): void {
    this.docSeq++;
    this.openId = null;
    this.doc = null;
    this.findQ = null;
    this.writeUrl();
    this.markSelected();
    this.$('pcBody').classList.remove('is-open');
    document.body.classList.remove('pr-reading');
    const viewer = this.$('pcViewer');
    viewer.hidden = true;
    viewer.innerHTML = '';
    if (this.listScrollY != null && window.matchMedia(NARROW).matches) window.scrollTo(0, this.listScrollY);
    this.listScrollY = null;
  }

  private renderViewer(): void {
    const d = this.doc!;
    const cls = courtClass(d);
    this.$('pcViewer').innerHTML = `
      <div class="pr-viewer__bar">
        <button type="button" class="btn btn-sm btn-outline-secondary pr-viewer__back" data-act="close">← 목록</button>
        <div class="pr-viewer__title" title="${esc(d.title)}">
          <span class="pr-viewer__meta">${esc(SHORT_COURT[cls] || courtName(d))} · ${esc(d.caseNo)}</span>${esc(d.title)}
        </div>
        <div class="pr-viewer__tools">
          <form class="pr-find" role="search">
            <input type="search" id="pcFindQ" class="form-control form-control-sm" placeholder="본문 안 찾기" aria-label="본문 안 찾기"
              value="${esc(this.findQ ?? this.tokens()[0] ?? '')}" />
            <span class="pr-find__pos" id="pcFindPos"></span>
            <button type="button" data-jump="-1" aria-label="이전 일치">▲</button>
            <button type="button" data-jump="1" aria-label="다음 일치">▼</button>
          </form>
          <a class="btn btn-sm btn-outline-secondary" href="${precApi.publicUrl(d.id)}" target="_blank" rel="noopener noreferrer">법령정보센터 ↗</a>
          <button type="button" class="btn btn-sm btn-outline-secondary pr-viewer__close" data-act="close" aria-label="닫기">✕</button>
        </div>
      </div>
      <div class="pr-viewer__content pc-doc" id="pcContent"></div>`;
    this.$('pcViewer').scrollTop = 0;
    this.renderDoc();
  }

  /** 본문 토막을 (다시) 그리고 찾는 말을 표시한다. 찾는 말이 접힌 토막(전문)에만 있으면 그 토막을 편다. */
  private renderDoc(): void {
    if (!this.doc) return;
    const content = this.$('pcContent');
    const tokens = this.docTokens();
    content.innerHTML = renderPrecCase(this.doc) + renderPrecSections(this.doc, tokens);
    this.marks = Array.from(content.querySelectorAll<HTMLElement>('mark'));
    this.markIdx = -1;
    const pos = this.$('pcFindPos');
    pos.textContent = '';
    if (!tokens.length) return;
    if (!this.marks.length) { pos.textContent = '없음'; return; }
    content.querySelectorAll<HTMLDetailsElement>('details').forEach((s) => { if (s.querySelector('mark')) s.open = true; });
    pos.textContent = `${this.marks.length}곳`;
    // 찾기 칸에 직접 넣은 말이면 처음 걸린 곳으로 간다(검색어로 연 것은 위에서부터 읽게 둔다)
    if (this.findQ != null) this.jump(1);
  }

  private jump(step: number): void {
    if (!this.marks.length) return;
    this.marks[this.markIdx]?.classList.remove('is-cur');
    this.markIdx = (this.markIdx + step + this.marks.length) % this.marks.length;
    const m = this.marks[this.markIdx];
    m.classList.add('is-cur');
    m.scrollIntoView({ block: 'center' });
    this.$('pcFindPos').textContent = `${this.markIdx + 1}/${this.marks.length}`;
  }
}
