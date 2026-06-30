// import { IncomingMessage, ServerResponse } from 'http';
import { Request, Response } from 'express';
import { BaseLawController } from './BaseLawController';
// import { LawService } from '../services/LawService';
import { LawModel } from '../models/LawModel';
import { LawTreeNode } from '../types/LawTreeNode';
import { isPro } from '../../auth/middleware/authGuard';
import DbContext from '../../common/DbContext';

// 비회원 연계표 티저: 상위 N개 '조'(최상위 법 노드, id != null)까지만 노출
const TEASER_ARTICLES = 3;

export class LawController extends BaseLawController<LawModel> {
  // private service: LawService;
  // private model: LawModel;

  constructor() {
    super(new LawModel());
  }

  // /all — 연계표. pro면 전체, 비회원/free면 상위 3개 조만 티저로 내려준다(나머지는 미전송 → 무유출).
  async getAll(req: Request, res: Response): Promise<void> {

    // 요청별 구조를 읽는다
    const dbName: string = req.query.law as string;
    const step: number = parseInt(req.query.step as string);
    const track: string | undefined = (req.query.track as string) || undefined;  // 멀티트랙 선택(없으면 단일)
    const dbContext = this.getDbContext(dbName);

    const dataTemp = await this.model.getAllLaws(dbContext, step, track);
    const data = this.model.toLawTree(dataTemp);

    // pro가 아니면 상위 3개 조까지만 잘라서 보내고 locked 플래그/전체 조 수(total)를 함께 내려준다.
    if (!isPro(req.member?.plan)) {
      const { nodes, total } = LawController.teaserTree(data, TEASER_ARTICLES);
      res.status(200).json({ success: true, data: nodes, locked: true, total });
      return;
    }

    res.status(200).json({ success: true, data });
  }

  /** 트리(최상위 = 조 단위)를 상위 max개 조까지만 남긴다. total은 원래 조 수. */
  private static teaserTree(tree: LawTreeNode[], max: number): { nodes: LawTreeNode[]; total: number } {
    const total = tree.reduce((n, node) => n + (node.id != null ? 1 : 0), 0);
    const nodes: LawTreeNode[] = [];
    let count = 0;
    for (const node of tree) {
      if (node.id != null && count >= max) break; // 다음 조부터 차단
      nodes.push(node);
      if (node.id != null) count++;
    }
    return { nodes, total };
  }

  // async getByIds(req: IncomingMessage, res: ServerResponse, lawIds: string[] | null) {
  async getByIds(req: Request, res: Response): Promise<void> {

    // 요청별 구조를 읽는다 (선택 연계표 = PRO 전용)
    const dbName: string = req.query.law as string;
    const step: number = parseInt(req.query.step as string);
    const track: string | undefined = (req.query.track as string) || undefined;
    const dbContext = this.getDbContext(dbName);

    // req.query.id를 배열로 변환
    const lawIds = Array.isArray(req.query.id)
      ? req.query.id as string[]
      : req.query.id
        ? [req.query.id as string]
        : [];

    if (lawIds.length === 0) {
      res.status(400).json({
        success: false,
        error: 'ID는 필수입니다.',
      });
      return;
    }

    // const data = await this.service.getLawById(id);
    const dataTemp = await this.model.getLawByIds(dbContext, step, lawIds, track);
    const data = this.model.toLawTree(dataTemp);
    // res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    // res.end(JSON.stringify(data));
    // res.status(200).json(data);
    res.status(200).json({ success: true, data });
  }

  // 법령 제목만 긁어오는 메서드
  async getTitles(req: Request, res: Response): Promise<void> {

    // 요청별 구조를 읽는다
    const dbName: string = req.query.law as string;
    const dbContext = this.getDbContext(dbName);

    const data = await this.model.getLawTitles(dbContext);

    // res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    // res.end(JSON.stringify({ success: true, data }));
    res.status(200).json({ success: true, data });

  }

  // 법령 목록 (/api/law/list) — ldb_auth.law_registry(명시적 목록)가 단일 출처. 프론트 드롭다운/설정 구성용.
  async getLawList(req: Request, res: Response): Promise<void> {
    const data = await this.model.getLawRegistry();
    res.status(200).json({ success: true, data });
  }

  // 법령명 메타 조회 (/api/law/meta)
  async getMeta(req: Request, res: Response): Promise<void> {
    const dbName: string = req.query.law as string;
    const track: string | undefined = (req.query.track as string) || undefined;
    const dbContext = this.getDbContext(dbName);
    const data = await this.model.getMeta(dbContext, track);
    res.status(200).json({ success: true, data });
  }

  // 단일 조문 내용 조회 (/api/law/article)
  async getArticle(req: Request, res: Response): Promise<void> {
    const dbName: string = req.query.law as string;
    const dbContext = this.getDbContext(dbName);

    const origin = req.query.origin as string;
    const id = req.query.id as string;

    if (!origin || !id) {
      res.status(400).json({ success: false, error: 'origin과 id 파라미터가 필요합니다.' });
      return;
    }

    const data = await this.model.getArticle(dbContext, origin.toLowerCase(), id);
    if (!data) {
      res.status(404).json({ success: false, error: '조문을 찾을 수 없습니다.' });
      return;
    }

    res.status(200).json({ success: true, data });
  }

  // 전체 강조쌍 (/api/law/highlights?law=) — 5단표에서 행의 연결에 참여하는 항/호 강조용.
  async getHighlights(req: Request, res: Response): Promise<void> {
    const dbName: string = req.query.law as string;
    const dbContext = this.getDbContext(dbName);
    const data = await this.model.getHighlights(dbContext);
    res.status(200).json({ success: true, data });
  }

  // 위임 체인 (/api/law/delegation?law=&id=) — 벌칙 위반조가 위임한 하위(시행령 등) 조문.
  async getDelegationChain(req: Request, res: Response): Promise<void> {
    const dbName: string = req.query.law as string;
    const id = req.query.id as string;
    if (!id) {
      res.status(400).json({ success: false, error: 'id 파라미터가 필요합니다.' });
      return;
    }
    const dbContext = this.getDbContext(dbName);
    const data = await this.model.getDelegationChain(dbContext, id);
    res.status(200).json({ success: true, data });
  }

  // 기준 전환 피벗 연계표 (/api/law/pivot?law=&step=&base=) — PRO 전용(킬).
  // base(기준 레벨)의 각 조문 기준으로 위·아래 연결조문을 묶어 1행씩 내려준다.
  async getPivot(req: Request, res: Response): Promise<void> {
    const dbName: string = req.query.law as string;
    const step: number = parseInt(req.query.step as string);
    const base = (req.query.base as string || '').toLowerCase();
    const track: string | undefined = (req.query.track as string) || undefined;

    const levels = ['a', 'e', 's', 'r', 'b'].slice(0, step || 0);
    if (base === 'a' || !levels.includes(base)) {
      res.status(400).json({ success: false, error: 'base는 e/s/r/b 중 하나여야 합니다.' });
      return;
    }

    const dbContext = this.getDbContext(dbName);
    const rows = await this.model.getPivot(dbContext, step, base, track);

    // parent_id 로 기준조별 LawTreeNode 트리를 구성한다(기존 5단표와 동일 렌더 경로로 흘려보내려고).
    // 기준조 = 루트, 상향(직접)·하향(전이) 조문 = 자식. 컬럼 배치는 프론트(LawTable)가 id 접두사(레벨)로 처리.
    // 행 순서: base → up → down(depth 오름차순)이라 부모가 자식보다 먼저 등장 → 그때그때 부착 가능.
    // base_id 별로 행을 모은다. (SQL 정렬: base→up→down, depth 오름차순)
    type Row = (typeof rows)[number];
    const groups = new Map<string, { base?: Row; up: Row[]; down: Row[] }>();
    for (const r of rows) {
      let g = groups.get(r.base_id);
      if (!g) { g = { up: [], down: [] }; groups.set(r.base_id, g); }
      if (r.dir === 'base') g.base = r;
      else if (r.dir === 'up') g.up.push(r);
      else g.down.push(r);
    }

    const mk = (id: string, content: string | null, sched: string | null, date: string | null): LawTreeNode =>
      ({ id, title: content, scheduledTitle: sched ?? null, scheduledDate: date ?? null, children: [] });

    // 핵심: up(상위)을 base의 '자식'이 아니라 '조상'으로 역링크해 선형 사슬(A2→S2→R2)을 만든다.
    // 별 모양(base 밑에 up·down 형제)이면 5단 렌더러가 첫 자식만 같은 줄에 두고 나머지를 새 줄로 떨궈
    // 기준조의 상·하위가 서로 다른 행에 흩어진다. 선형이면 leaf 1개 = 1행으로 한 줄에 모인다.
    const roots: LawTreeNode[] = [];
    for (const g of groups.values()) {
      if (!g.base) continue;
      const baseNode = mk(g.base.base_id, g.base.base_content, g.base.base_sched, g.base.base_date);

      // 하향(down): base 밑으로 정상 중첩 (base→down1→down2). depth asc라 부모가 먼저 등장.
      const dmap = new Map<string, LawTreeNode>([[g.base.base_id, baseNode]]);
      for (const r of g.down) {
        const node = mk(r.node_id, r.node_content, r.node_sched, r.node_date);
        ((r.parent_id && dmap.get(r.parent_id)) || baseNode).children!.push(node);
        if (!dmap.has(r.node_id)) dmap.set(r.node_id, node);
      }

      if (!g.up.length) {
        baseNode.id_aa = baseNode.id ?? undefined;  // 루트는 title-row(장·절) 회피 위해 id_aa truthy
        roots.push(baseNode);
        continue;
      }

      // 상향(up): 각 up노드의 자식 = 원래 parent_id(한 단계 아래). 최상위 up(아무도 가리키지 않는 노드)이 루트.
      const umap = new Map<string, LawTreeNode>();
      for (const r of g.up) umap.set(r.node_id, mk(r.node_id, r.node_content, r.node_sched, r.node_date));
      for (const r of g.up) {
        const childNode = r.parent_id === g.base.base_id ? baseNode : umap.get(r.parent_id as string);
        if (childNode) umap.get(r.node_id)!.children!.push(childNode);
      }
      const upParentIds = new Set(g.up.map(r => r.parent_id));
      for (const r of g.up) {
        if (upParentIds.has(r.node_id)) continue; // 누군가의 부모이면 루트 아님
        const rootNode = umap.get(r.node_id)!;
        rootNode.id_aa = rootNode.id ?? undefined;
        roots.push(rootNode);                     // 상위가 분기하면 사슬마다 1행(base 서브트리 공유)
      }
    }

    res.status(200).json({ success: true, data: roots, base });
  }
}
