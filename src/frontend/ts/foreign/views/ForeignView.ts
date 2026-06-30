import { ForeignLawMeta, ForeignProvision } from '../models/ForeignFetchModel';

/**
 * 해외법령 뷰 (seg-level) — 1 row = 1 seg.
 * part(편/장) 그룹 → article 그룹 헤더(첫 seg heading, 목차 앵커) → seg 별 [원문|번역|메모] 행.
 * 메모는 (article_no, seg_index) 논리키. 표 seg(markdown)는 renderRich 가 <table> 로 렌더.
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

  /** article_no → 안정 앵커 id */
  private articleId(articleNo: string): string {
    return 'fa-' + String(articleNo).replace(/[^a-zA-Z0-9]/g, '_');
  }

  renderTable(meta: ForeignLawMeta, provisions: ForeignProvision[], memos: Record<string, string>, canMemo: boolean, canEdit = false): string {
    const trans = this.transLabel(meta.translation_source);
    const status = this.statusLabel(meta.status);

    const introHtml = meta.summary ? `<div class="fm-intro">
        <div class="fm-intro-summary">${this.esc(meta.summary)}</div>
        ${meta.highlights && meta.highlights.length
          ? `<ul class="fm-intro-hi">${meta.highlights.map(h => `<li>${this.esc(h)}</li>`).join('')}</ul>`
          : ''}
        ${meta.source_url ? `<div class="fm-intro-src"><a href="${this.esc(meta.source_url)}" target="_blank" rel="noopener"><i class="fas fa-up-right-from-square"></i> 원문 출처</a></div>` : ''}
      </div>` : '';

    let html = `<div class="container-fluid fm-wrap">`;
    html += `<div class="fm-back"><a href="foreign.html"><i class="fas fa-arrow-left"></i> 해외법령 목록</a></div>`;
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
    html += introHtml;

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
    let lastArticle: string | null = null;
    for (const seg of provisions) {
      if (seg.part_no && seg.part_no !== lastPart) {
        lastPart = seg.part_no;
        html += `<tr class="fm-part"><td colspan="3">${this.esc(seg.part_no)}</td></tr>`;
      }
      if (seg.article_no !== lastArticle) {
        lastArticle = seg.article_no;
        const isAnnex = /^ANNEX/i.test(seg.article_no);
        html += `<tr class="fm-art-head${isAnnex ? ' fm-annex' : ''}" id="${this.articleId(seg.article_no)}" data-pid="${seg.provision_id}"><td colspan="3">${this.headInner(seg, canEdit)}</td></tr>`;
      }
      const indent = seg.seg_kind === 'item' ? ' fm-indent' : '';
      const key = `${seg.article_no}|${seg.seg_index}`;
      const memo = memos[key];
      const memoCell = canMemo
        ? `<td class="fm-memo" data-code="${this.esc(meta.code)}" data-article="${this.esc(seg.article_no)}" data-seg="${seg.seg_index}">
             <div class="fm-memo-view">${memo ? this.esc(memo) : '<span class="fm-memo-add">+ 메모</span>'}</div>
           </td>`
        : `<td class="fm-memo fm-locked" title="PRO 전용 — 로그인 후 이용"><i class="fas fa-lock"></i></td>`;
      html += `<tr class="fm-seg${indent}" data-pid="${seg.provision_id}">
        <td class="fm-en" data-field="text_original">${this.cellInner('text_original', seg, canEdit)}</td>
        <td class="fm-ko-cell" data-field="text_ko">${this.cellInner('text_ko', seg, canEdit)}</td>
        ${memoCell}
      </tr>`;
    }

    html += `</tbody></table></div>`;
    return html;
  }

  /**
   * 원문/번역 셀 내부(관리자 수정버튼 + 본문). 인라인 수정 종료/저장 후 셀 복원에도 재사용.
   * → 셀 단위 교체라 거대 표라도 그 셀만 다시 그린다(table-layout:fixed → 열너비 재계산 없음).
   */
  cellInner(field: 'text_original' | 'text_ko', prov: ForeignProvision, canEdit: boolean): string {
    const pen = canEdit
      ? `<button type="button" class="fm-admin-edit fm-edit-cell" title="${field === 'text_ko' ? '번역' : '원문'} 수정"><i class="fas fa-pen"></i></button>`
      : '';
    if (field === 'text_original') {
      return `${pen}<div class="fm-en-body">${this.renderRich(prov.text_original || '')}</div>`;
    }
    const ko = prov.text_ko
      ? `<div class="fm-ko">${this.renderRich(prov.text_ko)}</div>`
      : `<div class="fm-ko fm-empty">— 번역 준비중 —</div>`;
    return `${pen}${ko}`;
  }

  /** 조 헤더 셀 내부(수정버튼 + 제목). 제목 수정 종료/저장 후 복원에도 재사용. */
  headInner(prov: ForeignProvision, canEdit: boolean): string {
    const isAnnex = /^ANNEX/i.test(prov.article_no);
    const koTitle = (prov.heading_ko || '').trim();
    const enTitle = (prov.heading || '').trim();
    const title = isAnnex
      ? this.esc(enTitle || prov.article_no)
      : `제${this.esc(prov.article_no)}조` +
        (koTitle ? ` ${this.esc(koTitle)}` : '') +
        (enTitle ? ` <span class="fm-toc-en">${this.esc(enTitle)}</span>` : '');
    const pen = canEdit
      ? `<button type="button" class="fm-admin-edit fm-edit-head" title="제목 수정"><i class="fas fa-pen"></i></button>`
      : '';
    return `${pen}<span class="fm-art-title">${title}</span>`;
  }

  /** 목차 HTML(관리자 제목 수정 후 목차만 가볍게 갱신용 공개 래퍼 — article 수만큼이라 저렴). */
  buildTocHtml(provisions: ForeignProvision[]): string {
    return this.buildToc(provisions);
  }

  /** 조문 목차(편/장 그룹 + 조 칩, article 단위). 칩 클릭 시 article 헤더로 스크롤. */
  private buildToc(provisions: ForeignProvision[]): string {
    let body = '';
    let lastPart: string | null = null;
    for (const seg of provisions) {
      if (seg.seg_index !== 1) continue; // article 첫 seg = article 대표
      if (seg.part_no && seg.part_no !== lastPart) {
        lastPart = seg.part_no;
        body += `<div class="fm-toc-part">${this.esc(this.cut(seg.part_no, 70))}</div>`;
      }
      const isAnnex = /^ANNEX/i.test(seg.article_no);
      const label = isAnnex ? this.esc(seg.article_no) : `제${this.esc(seg.article_no)}조`;
      const ko = (seg.heading_ko || '').trim();
      const en = (seg.heading || '').trim();
      let h = '';
      if (!isAnnex && (ko || en)) {
        const koPart = ko ? this.esc(this.cut(ko, 20)) : '';
        const enPart = en ? `<span class="fm-toc-en">${this.esc(this.cut(en, 26))}</span>` : '';
        h = ` <span class="fm-toc-h">${[koPart, enPart].filter(Boolean).join(' ')}</span>`;
      }
      const full = isAnnex
        ? (seg.heading || seg.article_no)
        : `제${seg.article_no}조 ${[ko, en].filter(Boolean).join(' / ')}`.trim();
      body += `<a class="fm-toc-item" href="#${this.articleId(seg.article_no)}" title="${this.esc(full)}">${label}${h}</a>`;
    }
    return `<div class="fm-toc"><div class="fm-toc-title"><i class="fas fa-list-ul"></i> 조문 목차 · 바로가기</div><div class="fm-toc-body">${body}</div></div>`;
  }

  private cut(s: string, n: number): string {
    s = String(s ?? '');
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  /** 마크다운 표(| … |)가 있으면 표로, 나머지는 개행 정리 후 문단으로. */
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

  /** 과도한 개행 정리(미국 Code·SG PDF 추출본 등). 항목 표시자 앞 개행만 유지. */
  private normalize(s: string): string {
    return String(s ?? '')
      .replace(/\r/g, '')
      .replace(/[ \t]*\n[ \t]*/g, '\n')
      .replace(/\n(?!\s*(\([0-9a-zA-Z]+\)|[0-9]+[.)]))/g, ' ')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{2,}/g, '\n')
      .trim();
  }

  private esc(s: string): string {
    return String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  }
}
