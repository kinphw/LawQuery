import { LawPenalty } from "../../types/LawPenalty";

export class LawPenaltyView {
    renderTable(penalties: LawPenalty[]): string {
        return `
            <div class="table-responsive small" style="height:100%;">
            <table class="table table-bordered table-sm align-middle">
                <thead class="table-primary">
                    <tr>
                        <th class="text-center align-middle" style="width:5%; position:sticky; top:0; z-index:2;">구분</th>
                        <th class="text-center align-middle" style="width:10%; position:sticky; top:0; z-index:2;">근거</th>
                        <th class="text-center align-middle" style="width:26%; position:sticky; top:0; z-index:2;">위반(법)</th>
                        <th class="text-center align-middle" style="width:18%; position:sticky; top:0; z-index:2;">위반(령)</th>
                        <th style="display:none; position:sticky; top:0; z-index:2; background:#fff;">법조문번호</th>
                        <th class="text-center align-middle" style="width:4%; position:sticky; top:0; z-index:2; ">원문(법)</th>
                        <th class="text-center align-middle" style="width:19%; position:sticky; top:0; z-index:2;">벌칙(법)</th>
                        <th class="text-center align-middle" style="width:8%; position:sticky; top:0; z-index:2; ">벌칙(령)</th>
                    </tr>
                </thead>
                <tbody>
                    ${penalties.map((p,i) => `
                        <tr>
                            <td class="text-break align-middle text-center">${p.category ?? ''}</td>
                            <td class="text-break align-middle">${p.item_a_log ?? ''}</td>
                            <td class="text-break align-middle">${p.content_pa ?? ''}</td>
                            <td class="text-break align-middle">${p.content_pe ?? ''}</td>
                            <td style="display:none;">${p.id_a ?? ''}</td>
                            <td class="text-center align-middle">
                                <button type="button" class="btn btn-outline-primary btn-sm law-origin-btn" data-index="${i}">보기</button>
                            </td>
                            <td class="text-break align-middle">${p.penalty_a_log ?? ''}</td>
                            <td class="text-break align-middle text-center">${p.penalty_e_log ?? ''}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            </div>
        `;
    }
}