import { Header } from '../../common/components/Header';
import { LawTable } from './components/LawTable';
import { LawResult } from '../types/LawResult';
import { LawTreeNode } from '../types/LawTreeNode';
import { ToastManager } from '../../common/components/ToastManager';

export class LawView {
    public header: Header;
    public lawTable: LawTable;
    private toastManager: ToastManager;    

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
            this.lawTable.render(results, searchText);
    }

    showToast(message: string): void {
        this.toastManager.showToast(message);
    }

}