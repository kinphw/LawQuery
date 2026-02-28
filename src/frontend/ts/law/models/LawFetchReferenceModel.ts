import ApiUrlBuilder from '../util/ApiUrlBuilder';
export class LawFetchReferenceModel {
    async getReferenceContent(id: string): Promise<{ items: { type: string, content: string }[] } | null> {
        const url = ApiUrlBuilder.buildWithParams('/api/law/reference', { id });
        const res = await fetch(url);
        const { data } = await res.json();
        return data ?? null;
    }
}