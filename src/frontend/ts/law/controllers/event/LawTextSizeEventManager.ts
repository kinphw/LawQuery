import { ILawController } from "../LawController";
import { ILawEventManager } from "./ILawEventManager";

export class LawTextSizeEventManager implements ILawEventManager {
    constructor(private controller: ILawController) {}

    bindEvents(): void {
        this.bindTextSizeEvents();
    }

    private bindTextSizeEvents(): void {
        document.querySelectorAll('input[name="textSize"]').forEach(radio => {
            radio.addEventListener('change', (e: Event) => this.handleTextSizeChange(e));
        });
    }

    private async handleTextSizeChange(e: Event): Promise<void> {
        const target = e.target as HTMLInputElement;
        this.controller.view.setTextSize(target.value);
        await this.controller.view.render(
            // this.controller.dataManager.currentResults
            this.controller.dataManager.getCurrentResults()
        );
        // this.controller.view.header.setInfoButtonHandler();
        this.controller.bindPostRenderEvents();

        this.controller.view.showToast('글자크기 변경');
    }
}