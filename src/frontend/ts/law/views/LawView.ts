import { Header } from '../../common/components/Header';
import { LawTable } from './components/LawTable';
import { LawCheckbox } from './components/LawCheckbox';

import { LawResult } from '../types/LawResult';
import { LawTitle } from '../types/LawTitle';

import { LawTreeNode } from '../types/LawTreeNode';
import { ToastManager } from '../../common/components/ToastManager';

export class LawView {
    private header: Header;
    private lawTable: LawTable;
    private lawCheckbox: LawCheckbox;
    private toastManager: ToastManager;

    // 벌칙정보 저장 //이건 최초 컨트롤러가 initialize할 때 세팅해주고, 이후에는 자체 사용
    // private penaltyIds: string[] = []; // 벌칙 ID 목록 저장
    private penaltyIds: Set<string> = new Set();
    private referenceData: Map<string, { hasText: boolean, annexes: string[] }> = new Map();


    setPenaltyIds(penaltyIds: string[]): void {
        this.penaltyIds = new Set(penaltyIds);
        // this.lawTable.setPenaltyIds(penaltyIds); // 이중 주입
    }

    getPenaltyIds(): Set<string> {
        return this.penaltyIds;
    }
    ////////////////////////////


    setReferenceData(data: Map<string, { hasText: boolean, annexes: string[] }>): void {
        this.referenceData = data;
    }

    getReferenceData(): Map<string, { hasText: boolean, annexes: string[] }> {
        return this.referenceData;
    }

    //////////////////////////////


    constructor() {
        this.header = new Header();
        this.lawTable = new LawTable(this);
        this.lawCheckbox = new LawCheckbox();
        this.toastManager = new ToastManager();
    }

    // render(results: LawResult[], searchText: string = ''): void {
    async render(results: LawTreeNode[], searchText: string = ''): Promise<void> {
        await this.header.init();
        document.getElementById('header')!.innerHTML = this.header.render('law');
        document.getElementById('results')!.innerHTML =
            // this.lawTable.render(results, searchText);
            this.lawTable.render(results, searchText);
    }

    renderLawCheckboxes(laws: Array<LawTitle>): void {
        // document.getElementById('lawCheckboxes')!.innerHTML = this.lawTable.renderLawCheckboxes(laws);
        document.getElementById('lawCheckboxes')!.innerHTML = this.lawCheckbox.renderLawCheckboxes(laws);
    }

    setTextSize(size: string): void {
        this.lawTable.setTextSize(size);
    }

    setInfoButtonHandler(): void {
        this.header.setInfoButtonHandler();
    }

    showToast(message: string): void {
        this.toastManager.showToast(message);
    }

}