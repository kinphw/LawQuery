import { getLawConfig } from '../../config/LawConfig';

export class CurrentLawBox {
    static update(): void {
        const law = new URLSearchParams(window.location.search).get('law') || 'j';
        const currentLawBox = document.getElementById('currentLawBox');
        if (currentLawBox) {
            currentLawBox.textContent = getLawConfig(law).label;
        }
    }

    static updateWithLabel(label: string): void {
        const currentLawBox = document.getElementById('currentLawBox');
        if (currentLawBox) {
            currentLawBox.textContent = label;
        }
    }
}