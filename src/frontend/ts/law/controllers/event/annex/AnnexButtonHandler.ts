import { ILawController } from "../../LawController";
import { LawAnnex } from "../../../types/LawAnnex";
import { AnnexModalManager } from "./AnnexModalManager";
import { AnnexPopupManager } from "./AnnexPopupManager";

export class AnnexButtonHandler {
    constructor(
        private controller: ILawController,
        private modalManager: AnnexModalManager,
        private popupManager: AnnexPopupManager
    ) { }

    async handleAnnexClick(): Promise<void> {
        try {
            // this.controller.view.showToast('진입!');
            const annexes: LawAnnex[] = await this.controller.modelFetchAnnex.getAnnex();
            const tableHtml = this.controller.viewAnnex.renderTable(annexes, true);
            this.modalManager.showAnnexModal(tableHtml);

        } catch (err) {
            this.controller.view.showToast('별표 정보를 불러오는 데 실패했습니다.');
        }
    }

    async handleArticleAnnexClick(id_src: string, x: number, y: number): Promise<void> {
        try {
            this.popupManager.closePopup();
            const annexes: LawAnnex[] = await this.controller.modelFetchAnnex.getAnnex([id_src]);

            if (!annexes || annexes.length === 0) {
                this.controller.view.showToast('별표 정보가 없습니다.');
                return;
            }

            // 별표가 딱 1개라면 팝업 생략하고 바로 뷰어(모달) 띄우기
            if (annexes.length === 1 && annexes[0].annex_url) {
                this.modalManager.showAnnexViewerModal(annexes[0].annex_url, annexes[0].annex_name ?? undefined);
                return;
            }

            // 2개 이상이거나 url이 없는 예외 상황이라면 팝업 표출
            const popupHtml = this.controller.viewAnnex.renderPopupTable(annexes);
            this.popupManager.showPopup(popupHtml, x + 10, y + 10);
        } catch (err) {
            this.controller.view.showToast('별표 정보를 불러오는 데 실패했습니다.');
        }
    }
}
