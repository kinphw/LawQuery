import { Header } from '../../common/components/Header';
import { LawTable } from './components/LawTable';
import { LawResult } from '../types/LawResult';
import { LawTreeNode } from '../types/LawTreeNode';
import { ToastManager } from '../../common/components/ToastManager';

export class LawView {
    public header: Header;
    public lawTable: LawTable;
    private toastManager: ToastManager;    

    // 벌칙정보 저장 //이건 최초 컨트롤러가 initialize할 때 세팅해주고, 이후에는 자체 사용
    private penaltyIds: string[] = []; // 벌칙 ID 목록 저장

    setPenaltyIds(penaltyIds: string[]): void {
        this.penaltyIds = penaltyIds;
        this.lawTable.setPenaltyIds(penaltyIds); // 이중 주입
    }
    ////////////////////////////


    constructor() {
        this.header = new Header();
        this.lawTable = new LawTable();
        this.toastManager = new ToastManager();        
    }

    // render(results: LawResult[], searchText: string = ''): void {
    async render(results: LawTreeNode[], searchText: string = ''): Promise<void> {
        await this.header.init();
        document.getElementById('header')!.innerHTML = this.header.render('law');
        document.getElementById('results')!.innerHTML = 
            // this.lawTable.render(results, searchText);
            this.lawTable.render(results, searchText, this.penaltyIds);
    }

    showToast(message: string): void {
        this.toastManager.showToast(message);
    }

}