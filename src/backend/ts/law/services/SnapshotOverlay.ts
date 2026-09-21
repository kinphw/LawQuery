import DbContext from '../../common/DbContext';
import { LawTreeNode } from '../types/LawTreeNode';
import { HistVersion, LawHistoryModel } from '../models/LawHistoryModel';
import { NodeRef, nodeText, normalizeArticle, parseNodeId } from '../utils/ArticleText';

const DATE_RE = /^\d{8}$/;

export interface SnapDates { at: string; vs: string | null; }

export interface SnapVersion {
  ef_date: string;
  prom_no: string | null;
  rev_kind: string | null;
  status: string | null;
  name: string | null;
  kind_name: string | null;
}

export interface SnapshotMeta {
  at: string;
  vs: string | null;
  older: string;
  newer: string;
  tiers: Record<string, { older: SnapVersion | null; newer: SnapVersion | null }>;
  /** 두 날짜 중 어느 쪽엔 있었지만 지금 연계표에는 자리가 없는 조(삭제·번호 이동). */
  gone: Array<{ tier: string; key: string; title: string; older: string | null; newer: string | null }>;
}

/** ?at=YYYYMMDD[&vs=YYYYMMDD]. 없거나 형식이 틀리면 null — 평소 조회. */
export function readDates(q: Record<string, unknown>): SnapDates | null {
  const at = typeof q.at === 'string' ? q.at : '';
  const vs = typeof q.vs === 'string' ? q.vs : '';
  if (!DATE_RE.test(at)) return null;
  return { at, vs: DATE_RE.test(vs) && vs !== at ? vs : null };
}

const info = (v: HistVersion | null): SnapVersion | null => v && {
  ef_date: v.ef_date, prom_no: v.prom_no, rev_kind: v.rev_kind, status: v.status, name: v.name, kind_name: v.kind_name,
};

const today = (): string => {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
};

type ArticleMap = Map<string, { title: string; text: string }>;

/**
 * 날짜 대비 — 연계표 트리(현행 연계)에 그날 시행 중이던 문언을 얹는다.
 *
 *   ?at=D          칸마다 D 날짜 시행본 문언(없던 조는 '없음')
 *   ?at=D1&vs=D2   옛 날짜 → 새 날짜 대비. node.cmp 에 두 문언과 상태(same·changed·added·removed·absent)
 *
 * 문언은 연혁 아카이브(db_hist_*), 연계는 현행 한 벌뿐이라 조번호로 짝짓는다 — 전부개정·조 이동이 큰
 * 규정은 번호가 같아도 다른 내용일 수 있다. 시행예정(content_*_sched)은 날짜 모드에서 쓰지 않는다
 * (시행예정일을 날짜로 찍으면 그 시행본이 곧 대상이다).
 */
export class SnapshotOverlay {
  private hist = new LawHistoryModel();

  async apply(db: DbContext, roots: LawTreeNode[], dates: SnapDates, track?: string, withGone = true): Promise<SnapshotMeta | null> {
    const versions = await this.hist.getVersions(db, track);
    if (!versions.length) return null;                       // 연혁 미적재 DB

    const single = !dates.vs;
    const older = dates.vs && dates.vs < dates.at ? dates.vs : dates.at;
    const newer = dates.vs && dates.vs > dates.at ? dates.vs : dates.at;

    const nodes: Array<{ node: LawTreeNode; ref: NodeRef }> = [];
    const walk = (list: LawTreeNode[]): void => {
      for (const n of list) {
        if (n.id && !n.isVirtual && !n.isTitle) {
          const ref = parseNodeId(String(n.id));
          if (ref) nodes.push({ node: n, ref });
        }
        if (n.children?.length) walk(n.children);
      }
    };
    walk(roots);
    const stemSplit = new Set(nodes.filter(x => x.ref.item !== null).map(x => x.ref.stemId));
    const itemSplit = new Set(nodes.filter(x => x.ref.ho !== null).map(x => x.ref.itemId as string));

    // versions 는 단 안에서 시행일 오름차순 — 그 날짜 이하 마지막 것이 그날 시행본
    const inForce = (tier: string, d: string): HistVersion | null => {
      let hit: HistVersion | null = null;
      for (const v of versions) if (v.origin === tier && v.article_count > 0 && v.ef_date <= d) hit = v;
      return hit;
    };
    const cache = new Map<string, ArticleMap>();
    const load = async (tier: string, v: HistVersion | null): Promise<ArticleMap | null> => {
      if (!v) return null;
      const k = `${tier}|${v.ver_ref}`;
      if (!cache.has(k)) {
        const m: ArticleMap = new Map();
        for (const a of await this.hist.getArticles(db, tier, v.ver_ref, track)) {
          if (!m.has(a.art_key)) m.set(a.art_key, { title: a.title ?? '', text: normalizeArticle(a.content) });
        }
        cache.set(k, m);
      }
      return cache.get(k)!;
    };

    const meta: SnapshotMeta = { at: dates.at, vs: dates.vs, older, newer, tiers: {}, gone: [] };
    const maps: Record<string, { o: ArticleMap | null; n: ArticleMap | null }> = {};
    for (const t of [...new Set(nodes.map(x => x.ref.tier))]) {
      const vo = single ? null : inForce(t, older);
      const vn = inForce(t, newer);
      meta.tiers[t] = { older: info(vo), newer: info(vn) };
      maps[t] = { o: await load(t, vo), n: await load(t, vn) };
    }

    for (const { node, ref } of nodes) {
      const m = maps[ref.tier];
      const cut = (map: ArticleMap | null): string | null =>
        nodeText(ref, map?.get(ref.key)?.text, stemSplit.has(ref.stemId), !!ref.itemId && itemSplit.has(ref.itemId));
      const tn = cut(m.n);
      node.scheduledTitle = null;
      node.scheduledDate = null;
      if (single) {
        node.title = tn ?? '';
        node.cmp = { older: null, newer: tn, state: tn === null ? 'absent' : 'same' };
        continue;
      }
      const to = cut(m.o);
      const state = to === null && tn === null ? 'absent'
        : to === null ? 'added'
        : tn === null ? 'removed'
        : to === tn ? 'same' : 'changed';
      node.title = tn ?? to ?? '';
      node.cmp = { older: to, newer: tn, state };
    }

    if (withGone) {
      const now = today();
      for (const t of Object.keys(maps)) {
        const present = new Set(nodes.filter(x => x.ref.tier === t).map(x => x.ref.key));
        const current = await load(t, inForce(t, now));
        const { o, n } = maps[t];
        const keys = [...new Set([...(o?.keys() ?? []), ...(n?.keys() ?? [])])];
        for (const k of keys) {
          if (present.has(k) || current?.has(k) || k.includes('#')) continue;   // 지금도 있는 조(연계 밖)는 '사라진 조'가 아니다
          const a = o?.get(k) ?? null;
          const b = n?.get(k) ?? null;
          meta.gone.push({ tier: t, key: k, title: (b ?? a)!.title, older: a?.text ?? null, newer: b?.text ?? null });
          if (meta.gone.length >= 400) break;
        }
      }
    }
    return meta;
  }
}
