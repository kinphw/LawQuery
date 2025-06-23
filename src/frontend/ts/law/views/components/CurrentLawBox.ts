export class CurrentLawBox {
    private static lawNames: Record<string, string> = {
        j: '전자금융거래법',
        y: '여신전문금융업법',
    };

    static update(): void {
        // URL에서 law 파라미터 읽기
        const urlParams = new URLSearchParams(window.location.search);
        const law = urlParams.get('law') || 'j'; // 기본값: 'j'

        // 현재 선택된 법령 표시 박스 업데이트
        const currentLawBox = document.getElementById('currentLawBox');
        if (currentLawBox) {
            currentLawBox.textContent = this.lawNames[law] || '알 수 없는 법령';
        }
    }
}