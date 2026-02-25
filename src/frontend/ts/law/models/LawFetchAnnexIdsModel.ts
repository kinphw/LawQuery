import ApiUrlBuilder from '../util/ApiUrlBuilder';

export class LawFetchAnnexIdsModel {
    private cache: Set<string> | null = null;
    private fetchPromise: Promise<Set<string>> | null = null;

    async getAnnexIds(): Promise<Set<string>> {
        if (this.cache) return this.cache;

        if (!this.fetchPromise) {
            this.fetchPromise = this.fetchData();
        }

        return this.fetchPromise;
    }

    private async fetchData(): Promise<Set<string>> {
        const urlParams = new URLSearchParams(window.location.search);
        const l = urlParams.get('law') || 'j';
        const url = ApiUrlBuilder.buildWithParams('/api/law/annexIds', { law: l });

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            const json = await response.json();
            const result = new Set<string>(json.data);
            this.cache = result;
            return result;
        } catch (error) {
            console.error('Failed to fetch annex IDs:', error);
            throw error;
        } finally {
            this.fetchPromise = null;
        }
    }
}
