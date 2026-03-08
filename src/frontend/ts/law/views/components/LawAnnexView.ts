import { LawAnnex } from "../../types/LawAnnex";
import { getLawConfig } from "../../config/LawConfig";

export class LawAnnexView {
    private originMap: Record<string, string>;

    constructor() {
        const law = new URLSearchParams(window.location.search).get('law') || 'j';
        this.originMap = getLawConfig(law).originMap;
    }

    setOriginMap(map: Record<string, string>): void {
        this.originMap = map;
    }

    renderTable(annexes: LawAnnex[], isFullView: boolean = true): string {
        return `
            <div class="table-responsive small" style="height:100%;">
            <table class="table table-bordered table-sm align-middle annex-table">
                <thead class="table-dark">
                    <tr>
                        <th class="text-center align-middle" style="width:10%;">원규정타입</th>
                        <th class="text-center align-middle" style="width:10%;">별표 포함조문</th>
                        <th class="text-center align-middle" style="width:10%;">별표번호</th>
                        <th class="text-center align-middle" style="width:60%;">별표명</th>
                        <th class="text-center align-middle" style="width:10%;">보기</th>
                    </tr>
                </thead>
                <tbody>
                    ${annexes.map(a => {
            const originName = this.originMap[a.origin?.toLowerCase() || ''] || a.origin;
            return `
                        <tr>
                            <td class="text-center">${originName}</td>
                            <td class="text-center">
                                <button type="button" class="btn btn-outline-info btn-sm view-src-article-btn" data-origin="${a.origin}" data-id_src="${a.id_src}">조문 보기</button>
                            </td>
                            <td class="text-center text-break">${a.annex_no ?? a.id_annex ?? ''}</td>
                            <td class="text-break">${a.annex_name ?? ''}</td>
                            <td class="text-center">
                                ${a.annex_url ? `<button type="button" data-url="${a.annex_url}" data-title="${a.annex_name ?? '별표 문서'}" class="btn btn-outline-success btn-sm law-annex-viewer-btn"><i class="fas fa-external-link-alt"></i> 원문보기</button>` : ''}
                            </td>
                        </tr>
                    `}).join('')}
                </tbody>
            </table>
            </div>
        `;
    }

    renderPopupTable(annexes: LawAnnex[]): string {
        if (!annexes || annexes.length === 0) {
            return '<span class="text-muted">별표 정보 없음</span>';
        }

        return `<ul class="list-group list-group-flush small">
            ${annexes.map(a => {
            const annexName = a.annex_name ?? '';
            const annexLabel = a.annex_no ? `${a.annex_no} ${annexName}` : annexName;
            return `
                <li class="list-group-item d-flex justify-content-between align-items-center px-1 py-1">
                    <span class="me-2" style="max-width: 300px;" title="${annexLabel}">${annexLabel}</span>
                    ${a.annex_url ? `<button type="button" data-url="${a.annex_url}" data-title="${annexLabel || '별표 문서'}" class="btn btn-outline-success btn-sm p-1 law-annex-viewer-btn" style="font-size: 0.75rem;"><i class="fas fa-external-link-alt"></i> 보기</button>` : ''}
                </li>
            `}).join('')}
        </ul>`;
    }
}
