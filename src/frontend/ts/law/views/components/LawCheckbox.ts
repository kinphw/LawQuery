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
            return `
                <div class="form-check w-100 ps-4">
                    <input class="form-check-input" type="checkbox" value="${law.id_a}" id="law${law.id_a}">
                    <label class="form-check-label small" for="law${law.id_a}">
                        ${law.title_a}
                    </label>
                </div>
            `;
        }).join('');
    }        
}
