import { ILawController } from '../LawController';
import { ILawEventManager } from './ILawEventManager';
import { LawTreeNode } from '../../types/LawTreeNode';
import { ModalManager } from '../../../common/components/ModalManager';
import { buildRows } from '../../history/OldNewDiff';

const fmt = (d: string): string =>
    /^\d{8}$/.test(d) ? `${d.slice(0, 4)}. ${Number(d.slice(4, 6))}. ${Number(d.slice(6, 8))}.` : d;

/** 조회 결과 트리에서 id 로 노드를 찾는다(칸의 data-id → 원 데이터). */
export function findNode(list: LawTreeNode[], id: string): LawTreeNode | null {
    for (const n of list) {
        if (n.id === id) return n;
        const hit = findNode(n.children ?? [], id);
        if (hit) return hit;
    }
    return null;
}

/**
 * LawCmpEventManager — 날짜 대비 칸의 '크게 보기'.
 * 칸 안 겹쳐 쓰기는 긴 조문에서 읽기 어려우므로, 그 칸의 두 문언을 신구 2단(법제처 신구법비교 모양)으로
 * 창에 띄운다. 안 바뀐 줄은 '(생 략)'으로 접는다(OldNewDiff).
 */
export class LawCmpEventManager implements ILawEventManager {

    private bound = false;

    constructor(private controller: ILawController) { }

    bindEvents(): void {
        if (this.bound) return;
        this.bound = true;
        document.addEventListener('click', (e) => {
            const btn = (e.target as HTMLElement).closest<HTMLElement>('.lq-cmp-zoom');
            if (!btn?.dataset.id) return;
            const node = findNode(this.controller.dataManager.getCurrentResults(), btn.dataset.id);
            if (node?.cmp) this.open(node);
        });
    }


    private open(node: LawTreeNode): void {
        const cmp = node.cmp!;
        const p = new URLSearchParams(window.location.search);
        const [older, newer] = [p.get('at') ?? '', p.get('vs') ?? ''].filter(Boolean).sort();
        const rows = buildRows(cmp.older, cmp.newer).map(r =>
            `<tr class="lq-h-${r.kind}"><td>${r.left}</td><td>${r.right}</td></tr>`).join('');
        const head = (cmp.newer ?? cmp.older ?? '').split('\n')[0].slice(0, 40);
        const html = `
            <div class="table-responsive">
                <table class="table table-bordered lq-hist-table mb-0">
                    <thead><tr><th>${fmt(older || '')} 시행본</th><th>${fmt(newer || '')} 시행본</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;

        const modal = document.getElementById('commonModal');
        const dialog = modal?.querySelector('.modal-dialog');
        if (dialog && !dialog.classList.contains('modal-xl')) {
            dialog.classList.add('modal-xl');                        // 2단 대비는 넓어야 읽힌다 — 닫으면 원래 크기로
            modal!.addEventListener('hidden.bs.modal', () => dialog.classList.remove('modal-xl'), { once: true });
        }
        ModalManager.showModal(`${head} — 두 날짜 대비`, html);
    }
}
