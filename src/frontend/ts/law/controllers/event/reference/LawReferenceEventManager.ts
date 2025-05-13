import { ILawEventManager } from "../ILawEventManager";
import { ReferenceButtonHandler } from "./ReferenceButtonHandler";

export class LawReferenceEventManager implements ILawEventManager {
    private buttonHandler: ReferenceButtonHandler;

    constructor() {
        this.buttonHandler = new ReferenceButtonHandler();
    }

    bindEvents(): void {
        this.buttonHandler.bindReferenceButtons();
    }
}