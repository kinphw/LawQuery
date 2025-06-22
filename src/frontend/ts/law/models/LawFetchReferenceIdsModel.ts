import ApiUrlBuilder from '../util/ApiUrlBuilder';
export class LawFetchReferenceIdsModel {
    async getReferenceIds(): Promise<string[]> {
        const url:string = ApiUrlBuilder.build('/api/law/referenceIds');
        const res = await fetch(url);
        const { data } = await res.json();
        return data ?? [];
    }
}