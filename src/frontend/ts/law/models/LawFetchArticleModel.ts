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
}
