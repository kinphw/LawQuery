import { LawTitle } from '../types/LawTitle';

export class LawFetchTitleModel {

    async getLawTitles(): Promise<LawTitle[]> {
        const response = await fetch('/api/law/getTitles');
        // const data = await response.json() as LawTitle[];
        const { data } = await response.json() as { success: boolean; data: LawTitle[] };
        return data;
    }    

}