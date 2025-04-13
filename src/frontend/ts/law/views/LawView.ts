import { Header } from '../../common/components/Header.js';
import { LawTable } from './components/LawTable.js';
import { LawResult } from '../types/LawResult.js';
import { ToastManager } from '../../common/components/ToastManager.js';

export class LawView {
    public header: Header;
    public lawTable: LawTable;
    private toastManager: ToastManager;    

    constructor() {
        this.header = new Header();
        this.lawTable = new LawTable();
        this.toastManager = new ToastManager();        
    }

    render(results: LawResult[], searchText: string = ''): void {
        document.getElementById('header')!.innerHTML = this.header.render('law');
        document.getElementById('results')!.innerHTML = 
            this.lawTable.render(results, searchText);
    }

    showToast(message: string): void {
        this.toastManager.showToast(message);
    }

}