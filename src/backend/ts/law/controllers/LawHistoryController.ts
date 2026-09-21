import { Request, Response } from 'express';
import { BaseLawController } from './BaseLawController';
import { LawHistoryModel } from '../models/LawHistoryModel';

const TIERS = ['a', 'e', 's', 'r', 'b'];

/**
 * 연혁 버전 목록 — 연계표 위 '시점' 바가 '개정 하나 골라 보기' 목록을 만들 때 쓴다.
 * 날짜별 문언 대비는 연계표 조회(/all·/get·/pivot 의 ?at=&vs=)가 SnapshotOverlay 로 한다.
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
}
