import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

// 글꼴을 싣지 않은 PDF(옛 기관 자료)·JBIG2/JPEG2000 스캔본을 위해 pdf.js 부속 자산을 함께 준다.
const VENDOR = new URL('assets/vendor/pdfjs/', document.baseURI).href;

const ZOOMS = [1, 1.25, 1.5, 2, 2.5, 3];
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
export function mountPdf(root: HTMLElement, url: string, converting: boolean): () => void {
  let alive = true;
  let doc: pdfjs.PDFDocumentProxy | null = null;
  let io: IntersectionObserver | null = null;
  let ro: ResizeObserver | null = null;
  let zoom = 1;
  let laidWidth = 0;
  let gen = 0;

  root.innerHTML = '<div class="pr-pdf__msg"></div><div class="pr-pdf__pages"></div>';
  const msg = root.querySelector<HTMLElement>('.pr-pdf__msg')!;
  const host = root.querySelector<HTMLElement>('.pr-pdf__pages')!;

  const fitWidth = () => Math.min(MAX_FIT, Math.max(280, host.clientWidth - 8));

  const renderInfo = (pages: number) => {
    msg.className = 'pr-pdf__msg pr-pdf__msg--info';
    msg.innerHTML =
      `<span>${pages}쪽</span>
       <span class="pr-pdf__zoom">
         <button type="button" data-zoom="-1" aria-label="축소"${zoom <= ZOOMS[0] ? ' disabled' : ''}>−</button>
         <span>${Math.round(zoom * 100)}%</span>
         <button type="button" data-zoom="1" aria-label="확대"${zoom >= ZOOMS[ZOOMS.length - 1] ? ' disabled' : ''}>+</button>
       </span>
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
      } catch (e) {
        // 창을 닫는 중이거나 쪽 하나가 깨진 경우 — 나머지 쪽은 계속
        if (alive && my === gen) console.warn(`[press] ${n}쪽을 그리지 못했습니다`, e);
      }
    };
    io = new IntersectionObserver(
      (entries) => { for (const e of entries) if (e.isIntersecting) void render(Number((e.target as HTMLElement).dataset.page)); },
      { root: scroller, rootMargin: '1200px 0px' },
    );
    wraps.forEach((w) => io!.observe(w));
  };

  msg.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-zoom]');
    if (!b) return;
    const i = ZOOMS.indexOf(zoom) + Number(b.dataset.zoom);
    if (i < 0 || i >= ZOOMS.length) return;
    zoom = ZOOMS[i];
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

  return () => {
    alive = false;
    io?.disconnect();
    ro?.disconnect();
    void doc?.destroy();
  };
}
