import ApiUrlBuilder from "../util/ApiUrlBuilder";

export class LawFetchArticleModel {
    async getArticle(origin: string, id: string): Promise<{ content: string } | null> {
        const url = ApiUrlBuilder.buildWithParams('/api/law/article', { origin, id });
        try {
            const response = await fetch(url);
            if (!response.ok) {
                return null;
            }
            const json = await response.json();
            if (json.success && json.data) {
                return json.data;
            }
            return null;
        } catch (error) {
            console.error('Error fetching article:', error);
            return null;
        }
    }

    /** 위임 체인 + 강조쌍 — 위반조가 위임한 하위(시행령 등) 조문 + 정밀 인용 매핑. */
    async getDelegationChain(id: string): Promise<{
        chain: Array<{ origin: string; id: string; content: string }>;
        highlights: Array<{ up: string; down: string }>;
    }> {
        const url = ApiUrlBuilder.buildWithParams('/api/law/delegation', { id });
        const empty = { chain: [], highlights: [] };
        try {
            const response = await fetch(url);
            if (!response.ok) return empty;
            const json = await response.json();
            return (json.success && json.data) ? json.data : empty;
        } catch {
            return empty;
        }
    }
}
