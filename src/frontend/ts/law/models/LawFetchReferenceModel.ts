import ApiUrlBuilder from '../util/ApiUrlBuilder';
export class LawFetchReferenceModel {
    async getReferenceContent(id: string): Promise<string | null> {

        const additionalParams = { id };
        const url = ApiUrlBuilder.buildWithParams('/api/law/reference', additionalParams);

        // const res = await fetch(`/api/law/reference?id=${encodeURIComponent(id)}`);
        const res = await fetch(url);
        const { data } = await res.json();
        return data ?? null;
    }
}