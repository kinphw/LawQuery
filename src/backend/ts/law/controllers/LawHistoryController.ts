import { Request, Response } from 'express';
import { BaseLawController } from './BaseLawController';
import { HistArticle, LawHistoryModel } from '../models/LawHistoryModel';

const TIERS = ['a', 'e', 's', 'r', 'b'];
const REF_RE = /^\d{1,20}(@\d{8})?$/;

/**
 * 개정 표기 — 문언이 아니라 '언제 고쳤나'의 꼬리표라, 개정될 때마다 날짜만 붙어 가짜 변경을 만든다.
 * 법제처 신구법비교도 이것들을 빼고 대비한다. 대비·표시 모두 걷어낸 문언으로 한다.
 *   <개정 2011.5.19, 2020.2.4>  <신설 2020. 8. 4.>  <종전의 제3호에서 이동, 2020. 8. 4.>  <2011.8.18>
 *   [본조신설 2013.5.22]  [전문개정 2008.12.31]  [종전 제5조는 제6조로 이동 <2020.1.1>]
 * <별표 1>·[별표 1의2]·<별지 제1호 서식> 같은 참조 표기는 문언이므로 남긴다.
 */
const ANNOTATIONS: RegExp[] = [
  /\[\s*(?:본조\s*신설|전문\s*개정|제목\s*개정|종전|시행일)[^[\]]*\]/g,
  /<\s*(?:개정|신설|전문개정|제목개정|본조신설|타법개정|종전)[^<>]*>/g,
  /<\s*\d{2,4}\s*\.\s*\d{1,2}\s*\.\s*\d{1,2}\s*\.?\s*>/g,
];

export function normalizeArticle(text: string): string {
  let t = text;
  for (const re of ANNOTATIONS) t = t.replace(re, '');
  return t.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}

/** 달라진 조 하나. 한쪽 버전에 그 조가 없으면 null(=신설·삭제). 문언은 개정 표기를 걷어낸 것. */
export interface HistChange {
  key: string;
  title: string;
  old: string | null;
  new: string | null;
}

/**
 * 연혁비교 — 한 단(법·시행령·감독규정·세칙)에서 두 시점을 골라 달라진 조만 돌려준다.
 * 줄(항·호) 맞춤·강조·(생략) 접기는 화면 모양의 문제라 프론트(OldNewDiff)가 한다.
 */
export class LawHistoryController extends BaseLawController<LawHistoryModel> {

  constructor() {
    super(new LawHistoryModel());
  }

  // /history/versions — 단별 버전 목록(시행일 오름차순)
  async getVersions(req: Request, res: Response): Promise<void> {
    try {
      const dbContext = this.getDbContext(req.query.law as string);
      const track = (req.query.track as string) || undefined;
      const [versions, meta] = await Promise.all([
        this.model.getVersions(dbContext, track),
        this.model.getMeta(dbContext, track),
      ]);
      const data = TIERS
        .map(origin => {
          const m = meta.find(x => x.origin === origin);
          return {
            origin,
            short_name: m?.short_name ?? origin,
            full_name: m?.full_name ?? '',
            versions: versions.filter(v => v.origin === origin),
          };
        })
        .filter(t => t.versions.length);
      res.status(200).json({ success: true, data });
    } catch (e) {
      console.error('[history/versions]', e);
      res.status(400).json({ success: false, error: '연혁 버전 목록을 불러오지 못했습니다.' });
    }
  }

  // /history/compare?origin=a&old=<ref>&new=<ref> — 달라진 조
  async getCompare(req: Request, res: Response): Promise<void> {
    const origin = String(req.query.origin ?? '');
    const oldRef = String(req.query.old ?? '');
    const newRef = String(req.query.new ?? '');
    if (!TIERS.includes(origin) || !REF_RE.test(oldRef) || !REF_RE.test(newRef)) {
      res.status(400).json({ success: false, error: '잘못된 요청입니다.' });
      return;
    }
    try {
      const dbContext = this.getDbContext(req.query.law as string);
      const track = (req.query.track as string) || undefined;
      const versions = (await this.model.getVersions(dbContext, track)).filter(v => v.origin === origin);
      const vOld = versions.find(v => v.ver_ref === oldRef);
      const vNew = versions.find(v => v.ver_ref === newRef);
      if (!vOld || !vNew) {
        res.status(404).json({ success: false, error: '해당 버전이 없습니다.' });
        return;
      }
      const [a, b] = await Promise.all([
        this.model.getArticles(dbContext, origin, oldRef, track),
        this.model.getArticles(dbContext, origin, newRef, track),
      ]);
      res.status(200).json({
        success: true,
        data: { origin, old: vOld, new: vNew, changes: LawHistoryController.diffArticles(a, b), total: { old: a.length, new: b.length } },
      });
    } catch (e) {
      console.error('[history/compare]', e);
      res.status(400).json({ success: false, error: '연혁비교를 불러오지 못했습니다.' });
    }
  }

  /**
   * 두 버전의 조 목록 → 달라진 조. 조번호(art_key)로 짝짓는다.
   * 순서는 개정본을 뼈대로 하고, 종전에만 있던(=삭제된) 조는 종전에서 바로 앞이던 조 뒤에 끼운다.
   */
  static diffArticles(a: HistArticle[], b: HistArticle[]): HistChange[] {
    const oldBy = new Map(a.map(x => [x.art_key, x]));
    const newBy = new Map(b.map(x => [x.art_key, x]));

    const order = b.map(x => x.art_key);
    let prev = -1;
    for (const x of a) {
      const at = order.indexOf(x.art_key);
      if (at >= 0) { prev = at; continue; }
      order.splice(prev + 1, 0, x.art_key);
      prev += 1;
    }

    const out: HistChange[] = [];
    for (const key of order) {
      const o = oldBy.get(key), n = newBy.get(key);
      const on = o ? normalizeArticle(o.content) : null;
      const nn = n ? normalizeArticle(n.content) : null;
      if (on === nn) continue;
      out.push({ key, title: (n ?? o)?.title ?? '', old: on, new: nn });
    }
    return out;
  }
}
