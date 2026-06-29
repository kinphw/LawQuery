import { ForeignLawMeta, ForeignProvision } from '../models/ForeignFetchModel';

/**
 * 해외법령 뷰 — 조문(article) 단위 2단 표(원문 | 번역) + 메모 열.
 * 한국 5단표(LawTable)와 달리 계층이 단순해 전용 렌더러를 둔다.
 */
export class ForeignView {
  private statusLabel(s: string): string {
    const map: Record<string, string> = {
      in_force: '시행 중', enacted: '제정', proposal: '제안(미발효)',
      passed_one_chamber: '일원 통과(미발효)', unknown: '',
    };
    return map[s] || s;
  }

  private transLabel(s: string): string {
    if (s === 'machine') return '기계번역(참고용)';
    if (s === 'official') return '공식번역';
    return '';
  }

  renderTable(meta: ForeignLawMeta, provisions: ForeignProvision[], memos: Record<number, string>, canMemo: boolean): string {
    const trans = this.transLabel(meta.translation_source);
    const status = this.statusLabel(meta.status);

    let html = `<div class="container-fluid fm-wrap">`;
    html += `<div class="fm-law-head">
      <h4 class="mb-1">${this.esc(meta.title_ko)}${meta.abbrev ? ` <span class="text-muted fs-6">(${this.esc(meta.abbrev)})</span>` : ''}</h4>
      <div class="text-muted small">${this.esc(meta.title_original)}</div>
      <div class="small mt-1">
        ${status ? `<span class="badge bg-secondary">${status}</span>` : ''}
        ${meta.is_crypto ? '<span class="badge bg-info text-dark">가상자산</span>' : ''}
        ${trans ? `<span class="badge bg-light text-dark border">${trans}</span>` : ''}
      </div>
      ${meta.official_citation ? `<div class="small text-secondary mt-1">인용양식: ${this.esc(meta.official_citation)}</div>` : ''}
    </div>`;

    if (!provisions.length) {
      html += `<div class="alert alert-warning">표시할 조문이 없습니다.</div></div>`;
      return html;
    }

    html += this.buildToc(provisions);

    html += `<table class="table table-bordered fm-table"><thead><tr>
      <th class="fm-col-en">원문</th>
      <th class="fm-col-ko">국문 번역</th>
      <th class="fm-col-memo">메모${canMemo ? '' : ' <i class="fas fa-lock small"></i>'}</th>
    </tr></thead><tbody>`;

    let lastPart: string | null = null;
    provisions.forEach((p, idx) => {
      if (p.part_no && p.part_no !== lastPart) {
        lastPart = p.part_no;
        html += `<tr class="fm-part"><td colspan="3">${this.esc(p.part_no)}</td></tr>`;
      }
      const isAnnex = /^ANNEX/i.test(p.article_no);
      const head = isAnnex
        ? `<div class="fm-head fm-annex">${this.esc(p.heading || p.article_no)}</div>`
        : `<div class="fm-head">Art. ${this.esc(p.article_no)}${p.heading ? ` — ${this.esc(p.heading)}` : ''}</div>`;
      const ko = p.text_ko
        ? `<div class="fm-ko">${this.renderRich(p.text_ko)}</div>`
        : `<div class="fm-ko fm-empty">— 번역 준비중 —</div>`;
      const memo = memos[p.provision_id];
      const memoCell = canMemo
        ? `<td class="fm-memo" data-pid="${p.provision_id}" data-code="${this.esc(meta.code)}">
             <div class="fm-memo-view">${memo ? this.esc(memo) : '<span class="fm-memo-add">+ 메모</span>'}</div>
           </td>`
        : `<td class="fm-memo fm-locked" title="PRO 전용 — 로그인 후 이용">
             <i class="fas fa-lock"></i>
           </td>`;
      html += `<tr id="fart-${idx}">
        <td class="fm-en">${head}<div class="fm-en-body">${this.renderRich(p.text_original || '')}</div></td>
        <td>${ko}</td>
        ${memoCell}
      </tr>`;
    });

    html += `</tbody></table></div>`;
    return html;
  }

  /** 조문 목차(편/장 그룹 + 조 칩). 칩 클릭 시 해당 조(tr#fart-N)로 스크롤. */
  private buildToc(provisions: ForeignProvision[]): string {
    let body = '';
    let lastPart: string | null = null;
    provisions.forEach((p, idx) => {
      if (p.part_no && p.part_no !== lastPart) {
        lastPart = p.part_no;
        body += `<div class="fm-toc-part">${this.esc(this.cut(p.part_no, 70))}</div>`;
      }
      const isAnnex = /^ANNEX/i.test(p.article_no);
      const label = isAnnex ? this.esc(p.article_no) : `제${this.esc(p.article_no)}조`;
      // 한글 제목 + 영문 원문 병기
      const ko = (p.heading_ko || '').trim();
      const en = (p.heading || '').trim();
      let h = '';
      if (!isAnnex && (ko || en)) {
        const koPart = ko ? this.esc(this.cut(ko, 20)) : '';
        const enPart = en ? `<span class="fm-toc-en">${this.esc(this.cut(en, 26))}</span>` : '';
        h = ` <span class="fm-toc-h">${[koPart, enPart].filter(Boolean).join(' ')}</span>`;
      }
      body += `<a class="fm-toc-item" href="#fart-${idx}">${label}${h}</a>`;
    });
    return `<div class="fm-toc"><div class="fm-toc-title"><i class="fas fa-list-ul"></i> 조문 목차 · 바로가기</div><div class="fm-toc-body">${body}</div></div>`;
  }

  private cut(s: string, n: number): string {
    s = String(s ?? '');
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  /**
   * 본문 렌더: 마크다운 표(| … |)가 있으면 표로 복원하고, 나머지는 개행 정리 후 문단으로.
   * 일반 평문(표 없음)은 표 감지에 안 걸려 기존 동작과 동일.
   */
  private renderRich(s: string): string {
    const raw = String(s ?? '');
    if (!/^\s*\|.*\|\s*$/m.test(raw)) {
      return `<div class="fm-flow">${this.esc(this.normalize(raw))}</div>`;
    }
    const lines = raw.split('\n');
    let html = '';
    let tbl: string[] = [];
    let para: string[] = [];
    const flushTable = () => { if (tbl.length) { html += this.mdTable(tbl); tbl = []; } };
    const flushPara = () => {
      if (para.length) {
        const t = para.join('\n').trim();
        if (t) html += `<div class="fm-flow">${this.esc(this.normalize(t))}</div>`;
        para = [];
      }
    };
    for (const ln of lines) {
      if (/^\s*\|.*\|\s*$/.test(ln)) { flushPara(); tbl.push(ln); }
      else { flushTable(); para.push(ln); }
    }
    flushTable(); flushPara();
    return html;
  }

  /** 마크다운 표 행 배열 → HTML 표. |---| 구분행은 제거. */
  private mdTable(rows: string[]): string {
    const cells = (r: string) =>
      r.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());
    const body = rows.filter(r => !/^\s*\|[\s:|-]+\|\s*$/.test(r));
    if (!body.length) return '';
    let h = '<table class="table table-sm table-bordered fm-md-table"><thead><tr>';
    h += cells(body[0]).map(c => `<th>${this.esc(c)}</th>`).join('') + '</tr></thead><tbody>';
    for (const r of body.slice(1)) {
      h += '<tr>' + cells(r).map(c => `<td>${this.esc(c)}</td>`).join('') + '</tr>';
    }
    return h + '</tbody></table>';
  }

  /**
   * 과도한 개행 정리(미국 Code·SG PDF 추출본은 단어 단위로 줄바꿈됨).
   * 항목 표시자((a)·(1)·1.·1)) 앞 개행만 유지하고 나머지 단일 개행은 공백으로 합친다.
   * 원문 데이터는 보존하고 표시 단계에서만 적용.
   */
  private normalize(s: string): string {
    return String(s ?? '')
      .replace(/\r/g, '')
      .replace(/[ \t]*\n[ \t]*/g, '\n')                                  // 개행 주변 공백 제거
      .replace(/\n(?!\s*(\([0-9a-zA-Z]+\)|[0-9]+[.)]))/g, ' ')           // 표시자 아닌 개행 → 공백
      .replace(/[ \t]{2,}/g, ' ')                                        // 중복 공백 정리
      .replace(/\n{2,}/g, '\n')                                          // 빈 줄 정리
      .trim();
  }

  private esc(s: string): string {
    return String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  }
}
