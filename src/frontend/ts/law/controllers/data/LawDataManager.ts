// import { ILawController } from "../LawController";
import { LawResult } from "../../types/LawResult";
import { LawTitle } from "../../types/LawTitle";
import { LawTreeNode } from "../../types/LawTreeNode";

export class LawDataManager {

    // private controller: ILawController;

    // public currentResults: LawResult[] = []; // Store current result
    private currentResults: LawTreeNode[] = []; // Store current results // 캡슐화하여 은닉
    private lawTitles: LawTitle[] = []; // Store law titles // 캡슐화

    private penaltyIds: string[] = []; // Store penalty IDs // 캡슐화

    private referenceData: Map<string, { hasText: boolean, annexes: string[] }> = new Map();


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

    public setPenaltyIds(penaltyIds: string[]): void {
        this.penaltyIds = penaltyIds;
    }
    public getPenaltyIds(): string[] {
        return this.penaltyIds;
    }

    public setReferenceData(data: { [key: string]: { hasText: boolean, annexes: string[] } }): void {
        this.referenceData = new Map(Object.entries(data));
    }

    public getReferenceData(): Map<string, { hasText: boolean, annexes: string[] }> {
        return this.referenceData;
    }
}
