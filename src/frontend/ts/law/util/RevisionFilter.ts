import { LawTreeNode } from '../types/LawTreeNode';

/**
 * RevisionFilter
 * ------------------------------------------------------------------
 * 연계표 트리에서 '시행예정 개정분'만 골라내는 순수 함수 모음.
 *
 * DB는 조문마다 현행(content_*)과 시행예정(content_*_sched)을 함께 들고 있고,
 * LawTable 이 그 둘을 인라인 diff(<del>/<ins>)로 이미 그린다. 다만 개정된 조는
 * 전체(전금법 142행·외국환거래법 81행) 중 스무 남짓이라 눈으로 찾아야 했다.
 * 여기서 개정 가지만 남긴 트리를 만들어 주면, 렌더 경로는 그대로 둔 채
 * '개정비교' 모드가 된다(국가법령정보센터 신구법비교의 '(생 략)' 압축과 같은 효과).
 */

/** 이 노드 자체에 시행예정 내용이 붙어 있는가. */
export function isRevised(n: LawTreeNode): boolean {
    return !!(n.scheduledTitle && n.scheduledTitle.trim());
}

/** 자기 또는 자손(하위규정) 중 하나라도 개정이면 true. */
export function hasRevision(n: LawTreeNode): boolean {
    return isRevised(n) || (n.children ?? []).some(hasRevision);
}

/**
 * 개정 가지만 남긴 사본.
 * - 개정 노드는 하위를 통째로 유지한다. 그 조가 시행령·감독규정·세칙에 어떻게 걸리는지
 *   (= 개정의 연쇄 영향)가 이 화면의 존재 이유이고, 법제처 신구법비교에는 없는 부분이다.
 * - 개정이 아닌 노드는 개정 자손이 달린 가지만 남기고, 없으면 통째로 탈락.
 * 원본 트리는 손대지 않는다 — 모드 해제 시 그대로 되돌려야 하므로.
 */
function pruneBranch(nodes: LawTreeNode[]): LawTreeNode[] {
    const out: LawTreeNode[] = [];
    for (const n of nodes) {
        if (!hasRevision(n)) continue;
        if (isRevised(n)) { out.push(n); continue; }   // 하위 전부 유지 → 사본 뜰 필요 없음
        out.push({ ...n, children: pruneBranch(n.children ?? []) });
    }
    return out;
}

/** 조 그룹 키. 연계표 루트는 항/호 단위이고 id_aa 가 그 조를 묶는다(피벗 트리는 없을 수 있음). */
function articleKey(n: LawTreeNode): string {
    return n.id_aa ?? n.id ?? '';
}

/**
 * 연계표 루트 배열에서 개정분만 골라낸다.
 *
 * 루트 하나는 '조'가 아니라 항/호 하나다. 개정된 항만 남기면 화면에
 * "21. \"가상자산\"이란…" 만 뜨고 몇 조인지 사라지므로, 개정이 있는 조의
 * 제목행(id === id_aa)은 개정이 없어도 맥락으로 함께 남긴다.
 * 제목행의 하위규정은 비운다 — 개정과 무관한 하위가 딸려오면 압축 효과가 사라진다.
 */
export function filterRevised(roots: LawTreeNode[]): LawTreeNode[] {
    const revisedArticles = new Set<string>();
    for (const r of roots) {
        if (!r.isTitle && hasRevision(r)) {
            const k = articleKey(r);
            if (k) revisedArticles.add(k);
        }
    }

    const out: LawTreeNode[] = [];
    for (const r of roots) {
        if (r.isTitle) continue;                       // 장·절 제목행은 개정과 무관
        const k = articleKey(r);
        if (!k || !revisedArticles.has(k)) continue;
        if (hasRevision(r)) {
            out.push(pruneBranch([r])[0]);
        } else if (r.id && r.id === r.id_aa) {
            out.push({ ...r, children: [] });          // 조 제목행(맥락용)
        }
    }
    return out;
}

/** 개정 노드 수 — 모든 단(법·시행령·감독규정·세칙·별표)을 통틀어 센다. */
export function countRevised(nodes: LawTreeNode[]): number {
    let n = 0;
    for (const node of nodes) {
        if (isRevised(node)) n++;
        n += countRevised(node.children ?? []);
    }
    return n;
}

/** 트리에 담긴 시행예정일 목록(중복 제거·오름차순). */
export function revisionDates(nodes: LawTreeNode[]): string[] {
    const set = new Set<string>();
    const walk = (list: LawTreeNode[]): void => {
        for (const n of list) {
            if (isRevised(n) && n.scheduledDate) set.add(n.scheduledDate);
            walk(n.children ?? []);
        }
    };
    walk(nodes);
    return Array.from(set).sort();
}

/** '20261203' | '2026-12-03' → '2026. 12. 3.' (그 외 표기는 원문 그대로). */
export function formatSchedDate(raw: string): string {
    const d = raw.replace(/\D/g, '');
    if (d.length !== 8) return raw;
    return `${d.slice(0, 4)}. ${Number(d.slice(4, 6))}. ${Number(d.slice(6, 8))}.`;
}
