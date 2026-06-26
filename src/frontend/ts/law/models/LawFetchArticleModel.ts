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

    /** 위임 체인 — 위반조가 rdb로 위임한 하위(시행령 등) 조문. 벌칙 원문 팝업에서 함께 표시. */
    async getDelegationChain(id: string): Promise<Array<{ origin: string; id: string; content: string }>> {
        const url = ApiUrlBuilder.buildWithParams('/api/law/delegation', { id });
        try {
            const response = await fetch(url);
            if (!response.ok) return [];
            const json = await response.json();
            return (json.success && json.data) ? json.data : [];
        } catch {
            return [];
        }
    }
}
