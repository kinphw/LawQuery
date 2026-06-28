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

    let html = `<div class="container fm-wrap">`;
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

    html += `<table class="table table-bordered fm-table"><thead><tr>
      <th class="fm-col-en">원문</th>
      <th class="fm-col-ko">국문 번역</th>
      <th class="fm-col-memo">메모${canMemo ? '' : ' <i class="fas fa-lock small"></i>'}</th>
    </tr></thead><tbody>`;

    let lastPart: string | null = null;
    for (const p of provisions) {
      if (p.part_no && p.part_no !== lastPart) {
        lastPart = p.part_no;
        html += `<tr class="fm-part"><td colspan="3">${this.esc(p.part_no)}</td></tr>`;
      }
      const head = `<div class="fm-head">Art. ${this.esc(p.article_no)}${p.heading ? ` — ${this.esc(p.heading)}` : ''}</div>`;
      const ko = p.text_ko
        ? `<div class="fm-ko">${this.esc(p.text_ko)}</div>`
        : `<div class="fm-ko fm-empty">— 번역 준비중 —</div>`;
      const memo = memos[p.provision_id];
      const memoCell = canMemo
        ? `<td class="fm-memo" data-pid="${p.provision_id}" data-code="${this.esc(meta.code)}">
             <div class="fm-memo-view">${memo ? this.esc(memo) : '<span class="fm-memo-add">+ 메모</span>'}</div>
           </td>`
        : `<td class="fm-memo fm-locked" title="PRO 전용 — 로그인 후 이용">
             <i class="fas fa-lock"></i>
           </td>`;
      html += `<tr>
        <td class="fm-en">${head}<div class="fm-en-body">${this.esc(p.text_original || '')}</div></td>
        <td>${ko}</td>
        ${memoCell}
      </tr>`;
    }

    html += `</tbody></table></div>`;
    return html;
  }

  private esc(s: string): string {
    return String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  }
}
