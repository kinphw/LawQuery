import { HistoryModel, HistTier } from './HistoryModel';
import { HistoryView, Pick, PickMap } from './HistoryView';

/**
 * HistoryController — 법령 화면의 '연혁비교' 탭(?view=hist).
 *
 * 기본조회(연계표 + 시행예정 겹쳐 보기)와는 데이터도 화면도 따로다. 연계표는 '현행 한 벌'을
 * 단끼리 이어 보는 표이고, 여기는 **단마다 두 시점을 골라** 법제처 신구법비교 모양으로 견준다.
 *
 * 선택은 URL ?h= 에 남는다 — 새로고침·링크 공유에도 같은 대비가 재현된다.
 *   h=a:254921@20240915~280277@20251216,e:none,s:2100000274812~2100000282622
 *   (단:종전~개정 | 단:none). 적히지 않은 단은 기본 선택(현행과 그 직전 버전).
 * 드롭다운을 바꾸면 그 단만 다시 불러온다(페이지를 다시 열지 않는다).
 */
export class HistoryController {

    static readonly HOST_ID = 'lawHistHost';

    private model = new HistoryModel();
    private view!: HistoryView;
    private tiers: HistTier[] = [];
    private picks: PickMap = new Map();
    private ticket = new Map<string, number>();     // 단별 요청 번호 — 늦게 도착한 옛 응답을 버린다

    async initialize(): Promise<void> {
        const host = document.getElementById(HistoryController.HOST_ID);
        if (!host) return;
        host.hidden = false;
        this.view = new HistoryView(host);
        this.view.renderLoadingShell();

        this.tiers = await this.model.getTiers();
        if (!this.tiers.length) { this.view.renderEmpty(); return; }

        this.picks = this.readUrl();
        this.view.renderShell(this.tiers, this.picks);
        this.view.onChange((origin, role, oldRef, newRef) => this.onChange(origin, role, oldRef, newRef));
        await Promise.all(this.tiers.map(t => this.load(t)));
    }

    // ── 선택 ───────────────────────────────────────────────────────

    /** 기본: 현행과 그 직전 버전. 현행이 맨 앞이면(뒤에 시행예정만 있으면) 현행 → 시행예정. */
    private defaultPick(t: HistTier): Pick {
        const vs = t.versions.filter(v => v.article_count > 0);
        if (vs.length < 2) return null;
        const cur = vs.map(v => v.status).lastIndexOf('현행');
        const ni = cur >= 1 ? cur : (cur === 0 ? 1 : vs.length - 1);
        return { old: vs[ni - 1].ver_ref, new: vs[ni].ver_ref };
    }

    private indexOf(t: HistTier, ref: string): number {
        return t.versions.findIndex(v => v.ver_ref === ref);
    }

    private readUrl(): PickMap {
        const raw = new URLSearchParams(window.location.search).get('h');
        const given = new Map<string, string>();
        for (const part of (raw ?? '').split(',')) {
            const i = part.indexOf(':');
            if (i > 0) given.set(part.slice(0, i), part.slice(i + 1));
        }
        const picks: PickMap = new Map();
        for (const t of this.tiers) {
            const g = given.get(t.origin);
            if (g === 'none') { picks.set(t.origin, null); continue; }
            const [o, n] = (g ?? '').split('~');
            const valid = !!g && this.indexOf(t, o) >= 0 && this.indexOf(t, n) >= 0;
            picks.set(t.origin, valid ? { old: o, new: n } : this.defaultPick(t));
        }
        return picks;
    }

    private writeUrl(): void {
        const url = new URL(window.location.href);
        const same = (a: Pick, b: Pick) => (a?.old ?? '') === (b?.old ?? '') && (a?.new ?? '') === (b?.new ?? '');
        if (this.tiers.every(t => same(this.picks.get(t.origin) ?? null, this.defaultPick(t)))) {
            url.searchParams.delete('h');
        } else {
            url.searchParams.set('h', this.tiers.map(t => {
                const p = this.picks.get(t.origin);
                return `${t.origin}:${p ? `${p.old}~${p.new}` : 'none'}`;
            }).join(','));
        }
        history.replaceState(history.state, '', url.toString());
    }

    private onChange(origin: string, role: 'old' | 'new', oldRef: string, newRef: string): void {
        const t = this.tiers.find(x => x.origin === origin);
        if (!t) return;

        let pick: Pick = null;
        if (oldRef !== 'none') {
            // '비교 안 함'에서 막 켰다면 개정 쪽은 드롭다운 첫 줄(최신)이 아니라 기본(현행)으로 맞춘다
            if (!this.picks.get(origin) && role === 'old') newRef = this.defaultPick(t)?.new ?? newRef;
            let a = this.indexOf(t, oldRef), b = this.indexOf(t, newRef);
            if (a < 0 || b < 0) return;
            if (a > b) [a, b] = [b, a];                   // 종전이 개정보다 나중이면 맞바꾼다
            pick = { old: t.versions[a].ver_ref, new: t.versions[b].ver_ref };
        }
        this.picks.set(origin, pick);
        this.view.setPick(origin, pick);
        this.writeUrl();
        void this.load(t);
    }

    // ── 불러오기 ───────────────────────────────────────────────────

    private async load(t: HistTier): Promise<void> {
        const n = (this.ticket.get(t.origin) ?? 0) + 1;
        this.ticket.set(t.origin, n);

        const pick = this.picks.get(t.origin) ?? null;
        if (!pick) { this.view.renderHidden(t); return; }
        if (pick.old === pick.new) {
            this.view.renderMessage(t, '같은 버전을 골랐습니다. 종전과 개정을 다른 시점으로 고르세요.');
            return;
        }

        this.view.renderLoading(t);
        const res = await this.model.compare(t.origin, pick.old, pick.new);
        if (this.ticket.get(t.origin) !== n) return;      // 그사이 선택이 또 바뀌었다
        if (!res) { this.view.renderMessage(t, '대비표를 불러오지 못했습니다.'); return; }
        this.view.renderCompare(t, res);
    }
}
