import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

// 글꼴을 싣지 않은 PDF(옛 기관 자료)·JBIG2/JPEG2000 스캔본을 위해 pdf.js 부속 자산을 함께 준다.
const VENDOR = new URL('assets/vendor/pdfjs/', document.baseURI).href;

// 100% = 칸 폭에 맞춤. 그 아래는 한 화면에 더 많이(쪽 전체·여러 쪽) 보려는 축소.
const ZOOMS = [0.4, 0.5, 0.65, 0.8, 1, 1.25, 1.5, 2, 2.5, 3];
const ZOOM_KEY = 'lq:press:zoom';
const SPREAD_KEY = 'lq:press:spread';
const SPREAD_GAP = 10;
const MAX_FIT = 1100;

/** 가장 가까운 스크롤 조상 — 넓은 화면에선 원문이 목록 옆 칸 안에서 스크롤한다(좁은 화면은 문서 전체가 스크롤). */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement ?? null; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === 'auto' || o === 'scroll') && p.classList.contains('pr-viewer')) return p;
  }
  return null;
}

/**
 * 원문 PDF 보기(pdf.js). 서버 /api/press/original/<id> 가 PDF 는 그대로, HWP·HWPX 는 변환해 PDF 로 준다.
 * AcctQuery PdfView 와 같은 방식: 캔버스 + 투명 텍스트 레이어(드래그·복사·브라우저 찾기).
 * 쪽이 많은 자료를 위해 자리만 먼저 깔고, 화면 가까이 온 쪽만 그린다.
 *
 * 폰·태블릿 분할 화면에선 A4 한 쪽이 화면 폭에 맞춰 작게 나오므로 확대(−/+)를 둔다 — 확대하면 쪽이
 * 칸보다 넓어져 가로로 민다. 칸 폭이 바뀌면(회전·분할 조정) 다시 맞춘다.
 *
 * @returns 정리 함수(다른 파일을 열거나 닫을 때 부른다)
 */
/** PDF 글자는 조각마다 띄어쓰기가 제멋대로라 공백을 다 빼고 견준다. */
const squash = (t: string) => t.replace(/\s+/g, '').toLowerCase();

/** 문서 안 찾기 상태 — 일치하는 쪽 수와 지금 보는 일치 쪽. */
export interface PdfHits { active: boolean; total: number; idx: number; page: number; scanned: boolean; }

export interface PdfHandle {
  destroy(): void;
  /** 찾을 말을 바꾼다(문서 창의 찾기 칸). 처음 걸린 쪽으로 간다. */
  find(tokens: string[]): void;
  /** 다음(+1)/이전(-1) 일치 쪽으로. */
  go(step: number): void;
}

export function mountPdf(
  root: HTMLElement, url: string, converting: boolean, tokens: string[] = [], onHits?: (h: PdfHits) => void,
): PdfHandle {
  let alive = true;
  let doc: pdfjs.PDFDocumentProxy | null = null;
  let io: IntersectionObserver | null = null;
  let ro: ResizeObserver | null = null;
  // 고른 배율은 다음 문서에도 이어진다
  let zoom = 1;
  try {
    const saved = Number(localStorage.getItem(ZOOM_KEY));
    if (ZOOMS.includes(saved)) zoom = saved;
  } catch { /* 저장소를 못 써도 그만 */ }
  // 두 쪽 보기 — 쪽을 둘씩 좌우로 나란히(1·2, 3·4 …). 100% 는 두 쪽이 칸 폭에 맞는 크기.
  let spread = false;
  try { spread = localStorage.getItem(SPREAD_KEY) === '1'; } catch { /* 저장소를 못 써도 그만 */ }
  let laidWidth = 0;
  let gen = 0;
  // 검색어가 있는 쪽 — 문서를 열면 처음 걸린 쪽으로 가고, ▲▼ 로 다음 쪽을 오간다
  let needles = tokens.map(squash).filter(Boolean);
  /** 쪽별 글자(공백 뺀 것) — 찾을 말을 바꿔도 다시 읽지 않게 */
  const pageTexts: (string | undefined)[] = [];
  let scanGen = 0;
  const report = () => onHits?.({ active: needles.length > 0, total: hitPages.length, idx: hitIdx, page: hitPages[hitIdx] ?? 0, scanned });
  let hitPages: number[] = [];
  let hitIdx = -1;
  let scanned = false;
  let pageEls: HTMLDivElement[] = [];
  /** 이 쪽이 그려지면 그 안의 첫 일치 자리로 내려간다 */
  let pendingHit = 0;

  root.innerHTML = '<div class="pr-pdf__msg"></div><div class="pr-pdf__pages"></div>';
  const msg = root.querySelector<HTMLElement>('.pr-pdf__msg')!;
  const host = root.querySelector<HTMLElement>('.pr-pdf__pages')!;

  /** 100% 일 때 한 쪽의 폭. 두 쪽 보기면 칸 폭의 절반. */
  const fitWidth = () => {
    const avail = host.clientWidth - 8;
    return Math.min(MAX_FIT, Math.max(spread ? 140 : 280, spread ? (avail - SPREAD_GAP) / 2 : avail));
  };

  const renderInfo = (pages: number) => {
    msg.className = 'pr-pdf__msg pr-pdf__msg--info';
    msg.innerHTML =
      `<span>${pages}쪽</span>
       <span class="pr-pdf__zoom">
         <button type="button" data-zoom="-1" aria-label="축소"${zoom <= ZOOMS[0] ? ' disabled' : ''}>−</button>
         <span>${Math.round(zoom * 100)}%</span>
         <button type="button" data-zoom="1" aria-label="확대"${zoom >= ZOOMS[ZOOMS.length - 1] ? ' disabled' : ''}>+</button>
       </span>
       <button type="button" class="pr-pdf__spread${spread ? ' is-on' : ''}" data-spread aria-pressed="${spread}">두 쪽 보기</button>
       <span class="pr-pdf__hint">글자를 끌어 복사 · Ctrl+F(그려진 쪽만)</span>`;
  };

  /** 쪽 자리를 다시 깔고(폭·확대가 바뀌었을 때) 보이는 쪽부터 그린다. 보던 쪽은 유지한다. */
  const layout = async () => {
    const pdf = doc;
    if (!pdf || !alive) return;
    const my = ++gen;
    io?.disconnect();

    // 다시 깔기 전에 보던 쪽을 기억
    const scroller = scrollParent(host);
    const topEdge = scroller ? scroller.getBoundingClientRect().top : 0;
    let keep = 0;
    for (const w of Array.from(host.children) as HTMLElement[]) {
      if (w.getBoundingClientRect().bottom > topEdge + 80) { keep = Number(w.dataset.page) || 0; break; }
    }

    laidWidth = fitWidth();
    const width = Math.round(laidWidth * zoom);
    const first = await pdf.getPage(1);
    if (my !== gen || !alive) return;
    const base = first.getViewport({ scale: 1 });
    const estH = Math.round((width * base.height) / base.width);
    host.innerHTML = '';
    host.classList.toggle('is-spread', spread);
    const wraps: HTMLDivElement[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const w = document.createElement('div');
      w.className = 'pr-pdf__page';
      w.style.width = `${width}px`;
      w.style.height = `${estH}px`;
      w.dataset.page = String(n);
      host.appendChild(w);
      wraps.push(w);
    }
    pageEls = wraps;
    renderInfo(pdf.numPages);
    if (keep > 1) wraps[keep - 1]?.scrollIntoView({ block: 'start' });

    const rendered = new Set<number>();
    const render = async (n: number) => {
      if (rendered.has(n) || !alive || my !== gen) return;
      rendered.add(n);
      try {
        const page = await pdf.getPage(n);
        const b = page.getViewport({ scale: 1 });
        const fit = width / b.width;
        // 캔버스가 너무 커지지 않게(폰 메모리) 확대할수록 배율을 낮춘다
        const dpr = Math.min(zoom > 2 ? 1.5 : 2, window.devicePixelRatio || 1);
        const vp = page.getViewport({ scale: fit * dpr });
        const w = wraps[n - 1];
        w.style.height = `${Math.round(b.height * fit)}px`;
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        canvas.className = 'pr-pdf__canvas';
        w.appendChild(canvas);
        await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport: vp }).promise;
        if (my !== gen) return;
        // 텍스트 레이어: 투명 글자를 얹어 드래그·복사·Ctrl+F 가 되게(실패해도 그림은 보인다)
        const tl = document.createElement('div');
        tl.className = 'textLayer';
        tl.style.setProperty('--scale-factor', String(fit));
        w.appendChild(tl);
        await new pdfjs.TextLayer({
          textContentSource: await page.getTextContent(),
          container: tl,
          viewport: page.getViewport({ scale: fit }),
        }).render();
        // 검색어 형광 표시. PDF 글자는 낱자·낱말 조각으로 쪼개져 있어 조각을 이어 붙인 글에서 찾고,
        // 일치 구간에 걸친 조각을 칠한다(조각이 한 줄 통째면 그 줄이 칠해진다).
        markLayer(tl);
        if (pendingHit === n) {
          pendingHit = 0;
          tl.querySelector('.pr-hit')?.scrollIntoView({ block: 'center' });
        }
      } catch (e) {
        // 창을 닫는 중이거나 쪽 하나가 깨진 경우 — 나머지 쪽은 계속
        if (alive && my === gen) {
          console.warn(`[press] ${n}쪽을 그리지 못했습니다`, e);
          // 하얀 쪽만 남기지 않는다 — 왜 못 그렸는지 그 자리에 적어 둔다(폰에선 콘솔을 볼 수 없다)
          const note = document.createElement('div');
          note.className = 'pr-pdf__fail';
          note.textContent = `${n}쪽을 그리지 못했습니다 — ${e instanceof Error ? e.message : String(e)}`;
          wraps[n - 1]?.appendChild(note);
        }
      }
    };
    io = new IntersectionObserver(
      (entries) => { for (const e of entries) if (e.isIntersecting) void render(Number((e.target as HTMLElement).dataset.page)); },
      { root: scroller, rootMargin: '1200px 0px' },
    );
    wraps.forEach((w) => io!.observe(w));
  };

  const markLayer = (tl: Element) => {
    tl.querySelectorAll('.pr-hit').forEach((sp) => sp.classList.remove('pr-hit'));
    if (!needles.length) return;
    const spans = Array.from(tl.querySelectorAll('span')).filter((sp) => !sp.children.length);
    const starts: number[] = [];
    let full = '';
    for (const sp of spans) { starts.push(full.length); full += squash(sp.textContent || ''); }
    for (const nd of needles) {
      for (let at = full.indexOf(nd); at !== -1; at = full.indexOf(nd, at + nd.length)) {
        const end = at + nd.length;
        for (let i = 0; i < spans.length; i++) {
          const a = starts[i];
          const b = i + 1 < spans.length ? starts[i + 1] : full.length;
          if (b > at && a < end && b > a) spans[i].classList.add('pr-hit');
        }
      }
    }
  };

  const goHit = (i: number) => {
    if (!hitPages.length || !doc) return;
    hitIdx = (i + hitPages.length) % hitPages.length;
    const el = pageEls[hitPages[hitIdx] - 1];
    const mark = el?.querySelector('.pr-hit');
    if (mark) mark.scrollIntoView({ block: 'center' });
    else { pendingHit = hitPages[hitIdx]; el?.scrollIntoView({ block: 'start' }); }
    report();
  };

  /** 쪽마다 글자를 읽어 검색어가 있는 쪽을 모은다. 처음 걸린 쪽이 나오는 대로 그리로 간다. */
  const scan = async () => {
    const pdf = doc;
    if (!pdf) return;
    const my = ++scanGen;
    hitPages = [];
    hitIdx = -1;
    pendingHit = 0;
    scanned = !needles.length;
    report();
    if (!needles.length) return;
    for (let n = 1; n <= pdf.numPages; n++) {
      if (!alive || my !== scanGen) return;
      let text = pageTexts[n - 1];
      if (text === undefined) {
        try {
          const tc = await (await pdf.getPage(n)).getTextContent();
          text = squash(tc.items.map((it) => ('str' in it ? it.str : '')).join(''));
        } catch { text = ''; /* 글자를 못 읽는 쪽은 건너뛴다 */ }
        if (my !== scanGen) return;
        pageTexts[n - 1] = text;
      }
      const t = text;
      if (needles.some((nd) => t.includes(nd))) {
        hitPages.push(n);
        if (hitPages.length === 1) goHit(0);
        else if (hitPages.length % 5 === 0) report();
      }
    }
    scanned = true;
    if (alive) report();
  };

  msg.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-spread]')) {
      spread = !spread;
      try { localStorage.setItem(SPREAD_KEY, spread ? '1' : '0'); } catch { /* 저장 못 해도 그만 */ }
      void layout();
      return;
    }
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-zoom]');
    if (!b) return;
    const i = ZOOMS.indexOf(zoom) + Number(b.dataset.zoom);
    if (i < 0 || i >= ZOOMS.length) return;
    zoom = ZOOMS[i];
    try { localStorage.setItem(ZOOM_KEY, String(zoom)); } catch { /* 저장 못 해도 그만 */ }
    void layout();
  });

  const load = async (retry: boolean) => {
    host.innerHTML = '';
    msg.className = 'pr-pdf__msg';
    msg.textContent = converting ? '원문을 PDF로 바꾸는 중… (처음 여는 HWP는 15~30초 걸립니다)' : '원문을 여는 중…';
    try {
      const r = await fetch(retry ? `${url}?retry=1` : url, { credentials: 'same-origin' });
      if (!r.ok) {
        let m = '원문을 불러오지 못했습니다.';
        try { m = ((await r.json()) as { error?: string }).error || m; } catch { /* 글로 된 답이 아님 */ }
        throw new Error(m);
      }
      const data = await r.arrayBuffer();
      if (!alive) return;
      doc = await pdfjs.getDocument({
        data,
        isEvalSupported: false,
        cMapUrl: `${VENDOR}cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `${VENDOR}standard_fonts/`,
        wasmUrl: `${VENDOR}wasm/`,
      }).promise;
      if (!alive) return;
      await layout();
      void scan();

      // 칸 폭이 눈에 띄게 바뀌면(회전·분할 화면 조정) 다시 맞춘다
      let timer = 0;
      ro = new ResizeObserver(() => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          if (alive && host.clientWidth > 0 && Math.abs(fitWidth() - laidWidth) > 24) void layout();
        }, 250);
      });
      ro.observe(root);
    } catch (e) {
      if (!alive) return;
      msg.className = 'pr-pdf__msg pr-pdf__msg--err';
      msg.textContent = e instanceof Error ? e.message : String(e);
      const again = document.createElement('button');
      again.type = 'button';
      again.className = 'btn btn-sm btn-light ms-2';
      again.textContent = '다시 시도';
      again.onclick = () => void load(true);
      msg.appendChild(again);
    }
  };
  void load(false);

  return {
    destroy() {
      alive = false;
      io?.disconnect();
      ro?.disconnect();
      void doc?.destroy();
    },
    find(next: string[]) {
      needles = next.map(squash).filter(Boolean);
      host.querySelectorAll('.textLayer').forEach(markLayer);
      void scan();
    },
    go(step: number) { goHit(hitIdx + step); },
  };
}
