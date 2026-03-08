import ApiUrlBuilder from '../util/ApiUrlBuilder';

export interface LawMeta {
    origin: string;
    full_name: string;
    short_name: string;
}

export class LawFetchMetaModel {
    async getMeta(): Promise<LawMeta[]> {
        const url = ApiUrlBuilder.build('/api/law/meta');
        const response = await fetch(url);
        const { data } = await response.json() as { success: boolean; data: LawMeta[] };
        return data;
    }
}
