import { ILawController } from "../LawController";
import { LawResult } from "../../types/LawResult";
import { LawTitle } from "../../types/LawTitle";
import { LawTreeNode } from "../../types/LawTreeNode";

export class LawDataManager {

    private controller: ILawController;

    // public currentResults: LawResult[] = []; // Store current results
    public currentResults: LawTreeNode[] = []; // Store current results
    public lawTitles: LawTitle[] = []; // Store law titles

    constructor(ILawController: ILawController) {
        this.controller = ILawController;
    }

    public async setAllLaws(): Promise<void> {
        // Fetch all laws from the model
        this.currentResults = await this.controller.model.getAllLaws();
    }

    public async setLawTitles(): Promise<void> {
        // Fetch law titles from the model
        this.lawTitles = await this.controller.model.getLawTitles();
    }
}
