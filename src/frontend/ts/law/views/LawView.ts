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

    // private penaltyIds: string[] = []; // 벌칙 ID 목록 저장
    private penaltyIds: Set<string> = new Set();
    private referenceData: Map<string, { hasText: boolean, annexes: string[] }> = new Map();
    private annexIds: Set<string> = new Set();


    setPenaltyIds(penaltyIds: string[]): void {
        this.penaltyIds = new Set(penaltyIds);
        // this.lawTable.setPenaltyIds(penaltyIds); // 이중 주입
    }

    getPenaltyIds(): Set<string> {
        return this.penaltyIds;
    }
    ////////////////////////////

    setAnnexIds(annexIds: Set<string>): void {
        this.annexIds = annexIds;
    }

    getAnnexIds(): Set<string> {
        return this.annexIds;
    }
    ////////////////////////////


    setReferenceData(data: Map<string, { hasText: boolean, annexes: string[] }>): void {
        this.referenceData = data;
    }

    getReferenceData(): Map<string, { hasText: boolean, annexes: string[] }> {
        return this.referenceData;
    }

    // 인용 강조쌍 — 5단표에서 행의 연결에 참여하는 항/호만 강조
    private highlights: Array<{ up: string; down: string }> = [];
    setHighlights(h: Array<{ up: string; down: string }>): void { this.highlights = h; }
    getHighlights(): Array<{ up: string; down: string }> { return this.highlights; }

    //////////////////////////////


    constructor() {
        this.header = new Header();
        this.lawTable = new LawTable(this);
        this.lawCheckbox = new LawCheckbox();
        this.toastManager = new ToastManager();
    }

    render(results: LawTreeNode[], searchText: string = ''): void {
        document.getElementById('header')!.innerHTML = this.header.render('law');
        document.getElementById('results')!.innerHTML =
            // this.lawTable.render(results, searchText);
            this.lawTable.render(results, searchText);
        this.lawTable.mountWindowing();   // 대형 법령 가상화: placeholder를 스크롤 시 채움(소·중형은 no-op)
    }

    /** 헤더만 렌더(토글바가 그 아래 위치하도록 모드와 무관하게 1회 호출). */
    renderHeaderOnly(): void {
        document.getElementById('header')!.innerHTML = this.header.render('law');
        this.header.setInfoButtonHandler();
    }

    renderLawCheckboxes(laws: Array<LawTitle>): void {
        // document.getElementById('lawCheckboxes')!.innerHTML = this.lawTable.renderLawCheckboxes(laws);
        document.getElementById('lawCheckboxes')!.innerHTML = this.lawCheckbox.renderLawCheckboxes(laws);
    }

    setLawNames(names: string[]): void {
        this.lawTable.names = names;
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