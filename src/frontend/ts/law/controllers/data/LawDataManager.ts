// import { ILawController } from "../LawController";
import { LawResult } from "../../types/LawResult";
import { LawTitle } from "../../types/LawTitle";
import { LawTreeNode } from "../../types/LawTreeNode";

export class LawDataManager {

    // private controller: ILawController;

    // public currentResults: LawResult[] = []; // Store current result
    private currentResults: LawTreeNode[] = []; // Store current results // 캡슐화하여 은닉
    private lawTitles: LawTitle[] = []; // Store law titles // 캡슐화

    // constructor(ILawController: ILawController) {
    //     // this.controller = ILawController;
    // }

    // public async setAllLaws(): Promise<void> {
    //     // Fetch all laws from the model
    //     // this.currentResults = await this.controller.model.getAllLaws();
    //     this.currentResults = await this.controller.modelFetchAll.getAllLaws();
    // }
    // 결합 해제
    public setCurrentResults(results: LawTreeNode[]): void {
        this.currentResults = results;
    }
    public getCurrentResults(): LawTreeNode[] {
        return this.currentResults;
    }
    // public async setLawTitles(): Promise<void> {
    //     // Fetch law titles from the model
    //     this.lawTitles = await this.controller.model.getLawTitles();
    // }

    public setLawTitles(titles: LawTitle[]): void {
        this.lawTitles = titles;
    }
    public getLawTitles(): LawTitle[] {
        return this.lawTitles;
    }
}
