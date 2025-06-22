import { LawTitle } from '../types/LawTitle';
import ApiUrlBuilder from '../util/ApiUrlBuilder';

export class LawFetchTitleModel {

    async getLawTitles(): Promise<LawTitle[]> {

        const url:string = ApiUrlBuilder.build('/api/law/getTitles');
        const response = await fetch(url);
        // const data = await response.json() as LawTitle[];
        const { data } = await response.json() as { success: boolean; data: LawTitle[] };
        return data;
    }    

}