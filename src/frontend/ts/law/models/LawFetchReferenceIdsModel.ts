import ApiUrlBuilder from '../util/ApiUrlBuilder';
export class LawFetchReferenceIdsModel {
    async getReferenceIds(): Promise<{ [key: string]: { hasText: boolean, annexes: string[] } }> {
        const url: string = ApiUrlBuilder.build('/api/law/referenceIds');
        const res = await fetch(url);
        const { data } = await res.json();
        return data ?? {};
    }
}