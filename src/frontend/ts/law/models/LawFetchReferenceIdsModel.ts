export class LawFetchReferenceIdsModel {
    async getReferenceIds(): Promise<string[]> {
        const res = await fetch('/api/law/referenceIds');
        const { data } = await res.json();
        return data ?? [];
    }
}