import { Request, Response } from 'express';
import { getPrecedent, PAGE_SIZE, PrecError, PrecSrc, searchPrecedents } from '../PrecApiClient';

const MAX_LEN = 200;
/** 사건번호 꼴(2013다69989 · 2020헌바583 · 2023고단4232) — 본문이 아니라 사건번호에서 찾아야 걸린다 */
const CASE_NO = /^\d{2,4}\s?[가-힣]{1,4}\s?\d+$/;

const str = (v: unknown) => String(v ?? '').trim().slice(0, MAX_LEN);

export class PrecController {
  private fail(res: Response, e: unknown, what: string): void {
    if (e instanceof PrecError) {
      res.status(e.status).json({ success: false, error: e.message });
      return;
    }
    console.error(`[prec] ${what}`, e);
    res.status(500).json({ success: false, error: '판례를 불러오지 못했습니다.' });
  }

  /**
   * 판례·헌재결정 목록(선고일 최신순, 두 출처를 한 목록으로).
   *   q    검색어 — 큰따옴표로 묶으면 문구 그대로(조문 단추가 `"법령명 제N조"` 로 부른다)
   *   in   body: 본문(기본) · title: 사건명·사건번호. 사건번호 꼴이면 알아서 title 로 찾는다.
   *   src  all(기본) · prec(법원 판례) · detc(헌재결정)
   *   jo   참조법령명(참조조문에 이 법령이 있는 판례) — 법원 판례에만 있는 조건이라 헌재는 빠진다
   */
  async search(req: Request, res: Response): Promise<void> {
    try {
      const query = str(req.query.q);
      const jo = str(req.query.jo);
      if (!query && !jo) throw new PrecError(400, '검색어를 입력하세요.');
      const page = Math.min(500, Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1));
      const src = String(req.query.src ?? 'all');
      const sources: PrecSrc[] = jo || src === 'prec' ? ['prec'] : src === 'detc' ? ['detc'] : ['prec', 'detc'];
      const title = req.query.in === 'title' || CASE_NO.test(query);
      const r = await searchPrecedents({
        query: query || undefined,
        search: query ? (title ? 1 : 2) : undefined,
        jo: jo || undefined,
        sources,
        page,
      });
      res.json({ success: true, page, size: PAGE_SIZE, in: title ? 'title' : 'body', ...r });
    } catch (e) { this.fail(res, e, 'search'); }
  }

  async detail(req: Request, res: Response): Promise<void> {
    try {
      const id = String(req.params.id);
      if (!/^c?\d{1,12}$/.test(id)) throw new PrecError(400, '올바른 판례 번호가 아닙니다.');
      res.json({ success: true, data: await getPrecedent(id) });
    } catch (e) { this.fail(res, e, 'detail'); }
  }
}
