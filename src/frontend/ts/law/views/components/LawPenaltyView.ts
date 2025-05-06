import { LawPenalty } from "../../types/LawPenalty";

export class LawPenaltyView {
    renderTable(penalties: LawPenalty[], isFullView:boolean = true): string {
        return `
            ${isFullView ? `
            <div class="mb-3">
                <div class="btn-group" role="group" aria-label="정렬 옵션">
                    <button type="button" class="btn btn-outline-primary" id="sortByPenalty">벌칙순</button>
                    <button type="button" class="btn btn-outline-primary" id="sortByCause">원인순</button>
                </div>                
            </div>
            ` : ''}    

            <div class="table-responsive small" style="height:100%;">
            <table class="table table-bordered table-sm align-middle penalty-table">
                <thead class="table-dark">
                    <tr>
                        <th class="text-center align-middle header-row-1" rowspan="2" style="width:5%;">구분</th>

                       <th class="text-center align-middle header-row-1" colspan="2">위반행위규정</th>

                        <th class="text-center align-middle header-row-1" colspan="3">벌칙규정</th>

                        <th class="text-center align-middle header-row-1" colspan="2">벌칙내용</th>
                    </tr>
                    <tr>
                        <th class="text-center align-middle header-row-2" style="width:15%;">위반행위근거</th>
                        <th class="text-center align-middle header-row-2" style="width:4%;">원문(법)</th>

                        <th class="text-center align-middle header-row-2" style="width:10%;">벌칙근거</th>
                        <th class="text-center align-middle header-row-2" style="width:22%;">벌칙(법)</th>
                        <th class="text-center align-middle header-row-2" style="width:15%;">벌칙(령)</th>

                        <th class="text-center align-middle header-row-2" style="width:20%;">벌칙(법)</th>
                        <th class="text-center align-middle header-row-2" style="width:9%;">벌칙(령)</th>
                    </tr>
                </thead>
                <tbody>
                    ${penalties.map((p, i) => `
                        <tr>
                            <td class="text-break text-center">${p.category ?? ''}</td>

                            <td class="text-break">${p.title_a ?? ''}</td>
                            <td class="text-center">
                                <button type="button" class="btn btn-outline-primary btn-sm law-origin-btn" data-index="${i}">보기</button>
                            </td>

                            <td class="text-break">${p.item_a_log ?? ''}</td>
                            <td class="text-break">${p.content_pa ?? ''}</td>
                            <td class="text-break">${p.content_pe ?? ''}</td>

                            <td class="text-break">${p.penalty_a_log ?? ''}</td>
                            <td class="text-break text-center">${p.penalty_e_log ?? ''}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            </div>
        `;
    }
}