import ApiUrlBuilder from '../util/ApiUrlBuilder';
import { LawAnnex } from '../types/LawAnnex';

export class LawFetchAnnexModel {
    private cache: { [url: string]: LawAnnex[] } = {};

    async getAnnex(id_src?: string[]): Promise<LawAnnex[]> {
        const urlParams = new URLSearchParams(window.location.search);
        const l = urlParams.get('law') || 'j';

        const params: any = { law: l };
        if (id_src && id_src.length > 0) {
            params.id_src = id_src; // 복수 전달 시 urlBuilder 내부 또는 fetch 시 qs로 파싱될 수 있도록
        }

        const url = ApiUrlBuilder.buildWithParams('/api/law/annex', params);

        if (this.cache[url]) {
            return this.cache[url];
        }

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            const json = await response.json();
            const result: LawAnnex[] = json.data;
            this.cache[url] = result;
            return result;
        } catch (error) {
            console.error('Failed to fetch annex:', error);
            throw error;
        }
    }
}
