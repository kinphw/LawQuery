import { ILawController } from "../LawController";
import { ILawEventManager } from "./ILawEventManager";

export class LawHeaderEventManager implements ILawEventManager {
    constructor(private controller: ILawController) {}

    bindEvents(): void {
        this.bindHeaderEvents();
    }

    private bindHeaderEvents(): void {
        this.controller.view.setInfoButtonHandler();
    }
}