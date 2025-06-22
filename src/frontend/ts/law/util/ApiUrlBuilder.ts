export default class ApiUrlBuilder {
    static build(baseUrl: string): string {
        const urlParams = new URLSearchParams(window.location.search);
        const law = urlParams.get('law') || 'j'; // 기본값: 'j'
        const step = urlParams.get('step') || '4'; // 기본값: '4'

        // 매개변수를 붙여서 반환
        return `${baseUrl}?law=${law}&step=${step}`;
    }

    static buildWithParams(baseUrl: string, additionalParams: Record<string, string | string[]>): string {
        const urlParams = new URLSearchParams(window.location.search);
        const law = urlParams.get('law') || 'j'; // 기본값: 'j'
        const step = urlParams.get('step') || '4'; // 기본값: '4'

        // 기본 파라미터 추가
        urlParams.set('law', law);
        urlParams.set('step', step);

        // 추가 파라미터 병합
        for (const [key, value] of Object.entries(additionalParams)) {
            if (Array.isArray(value)) {
                value.forEach(v => urlParams.append(key, v));
            } else {
                urlParams.set(key, value);
            }
        }

        return `${baseUrl}?${urlParams.toString()}`;
    }    
}