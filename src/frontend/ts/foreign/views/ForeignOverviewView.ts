import { ForeignLawListItem } from '../models/ForeignFetchModel';

/**
 * 해외법령 랜딩 = 국가별 소개 카탈로그.
 * /api/foreign/list(메타) + foreignIntro(큐레이션 설명)을 합쳐 카드로 렌더.
 * 카드 클릭 → ?code=<code> 로 기존 2단 뷰어 진입(드릴다운).
 * 설명이 아직 없는 법(센티넬 신규 적재 등)도 메타만으로 노출된다.
 */
const JURIS_ORDER = ['eu', 'us', 'jp', 'hk', 'sg', 'other'];
const JURIS_LABEL: Record<string, string> = {
  eu: '🇪🇺 유럽연합(EU)', us: '🇺🇸 미국', jp: '🇯🇵 일본',
  hk: '🇭🇰 홍콩', sg: '🇸🇬 싱가포르', other: '🌐 기타',
};

export class ForeignOverviewView {
  private statusBadge(s: string): string {
    const map: Record<string, [string, string]> = {
      in_force: ['시행 중', 'bg-success'],
      enacted: ['제정', 'bg-success'],
      proposal: ['제안(미발효)', 'bg-secondary'],
      passed_one_chamber: ['일원 통과(미발효)', 'bg-secondary'],
      unknown: ['', ''],
    };
    const [label, cls] = map[s] || [s, 'bg-secondary'];
    return label ? `<span class="badge ${cls}">${this.esc(label)}</span>` : '';
  }

  private transBadge(l: ForeignLawListItem): string {
    if (!l.provision_count) return '';
    if (!l.ko_count) return '<span class="badge bg-light text-dark border">원문만</span>';
    const pct = Math.round((l.ko_count / l.provision_count) * 100);
    return `<span class="badge bg-light text-dark border" title="${l.ko_count}/${l.provision_count} seg 번역">번역 ${pct}%</span>`;
  }

  render(laws: ForeignLawListItem[]): string {
    const groups: Record<string, ForeignLawListItem[]> = {};
    for (const l of laws) (groups[l.jurisdiction] ||= []).push(l);

    let html = `<div class="container fx-overview">
      <div class="text-center mb-4">
        <h4 class="mb-1">해외 결제·전자금융·가상자산 법령</h4>
        <p class="text-muted small mb-0">국가별로 어떤 법이 무슨 역할을 하는지 한눈에. 카드를 누르면 원문·한글 번역 본문으로 이동합니다.</p>
      </div>`;

    for (const j of JURIS_ORDER) {
      const arr = groups[j];
      if (!arr || !arr.length) continue;
      html += `<div class="fx-juris-head"><span class="fx-juris-label">${JURIS_LABEL[j] || j}</span>
        <span class="text-muted small">${arr.length}종</span></div>`;
      html += `<div class="row g-3 mb-4">`;
      for (const l of arr) html += this.card(l);
      html += `</div>`;
    }

    html += `</div>`;
    return html;
  }

  private card(l: ForeignLawListItem): string {
    const abbrev = l.abbrev ? `<span class="badge bg-dark me-1">${this.esc(l.abbrev)}</span>` : '';
    const crypto = l.is_crypto ? '<span class="badge bg-info text-dark">가상자산</span>' : '';
    const summary = l.summary
      ? `<p class="fx-card-summary">${this.esc(l.summary)}</p>`
      : `<p class="fx-card-summary text-muted fst-italic">소개 준비중 — 본문은 바로 보실 수 있어요.</p>`;
    const tags = (l.tags || [])
      .map(t => `<span class="fx-tag">${this.esc(t)}</span>`).join('');

    return `<div class="col-12 col-md-6 col-xl-4">
      <a class="fx-card" href="?code=${encodeURIComponent(l.code)}">
        <div class="fx-card-badges">${abbrev}${this.statusBadge(l.status)} ${crypto}</div>
        <div class="fx-card-title">${this.esc(l.title_ko)}</div>
        <div class="fx-card-en">${this.esc(l.title_original || '')}</div>
        ${summary}
        ${tags ? `<div class="fx-tags">${tags}</div>` : ''}
        <div class="fx-card-foot">
          ${this.transBadge(l)}
          <span class="fx-card-go">본문 보기 <i class="fas fa-arrow-right"></i></span>
        </div>
      </a>
    </div>`;
  }

  private esc(s: string): string {
    return String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  }
}
