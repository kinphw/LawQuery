export class LawFetchReferenceModel {
    async getReferenceContent(id: string): Promise<string | null> {
        const res = await fetch(`/api/law/reference?id=${encodeURIComponent(id)}`);
        const { data } = await res.json();
        return data ?? null;
    }
}