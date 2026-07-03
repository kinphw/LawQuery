import { LawTitle } from '../../types/LawTitle';

export class LawCheckbox {
    renderLawCheckboxes(laws: Array<LawTitle>): string {
        // this.lawIds = laws.filter(law => !law.isTitle).map(law => law.id_a!);
        
        return laws.map(law => {
            if (law.isTitle) {
                return `
                    <div class="form-check w-100 title-row">
                        <span class="fw-bold small bg-light d-block px-2 py-1">${law.title_a}</span>
                    </div>
                `;
            }
            // 라벨은 클릭 시 본문의 해당 조문으로 이동(data-goto). 선택조회용 체크(value)는 네모를 직접 클릭.
            // (for를 두면 라벨 클릭이 체크 토글로 가로채여 이동과 충돌하므로 for는 생략)
            return `
                <div class="form-check w-100 ps-4">
                    <input class="form-check-input" type="checkbox" value="${law.id_a}" id="law${law.id_a}">
                    <label class="form-check-label small lq-goto" data-goto="${law.id_a}" role="button" title="본문에서 이 조문으로 이동">
                        ${law.title_a}
                    </label>
                </div>
            `;
        }).join('');
    }        
}
