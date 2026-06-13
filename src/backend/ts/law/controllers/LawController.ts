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
    const dbContext = this.getDbContext(dbName);

    const dataTemp = await this.model.getAllLaws(dbContext, step);
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
    const dataTemp = await this.model.getLawByIds(dbContext, step, lawIds);
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

  // 법령명 메타 조회 (/api/law/meta)
  async getMeta(req: Request, res: Response): Promise<void> {
    const dbName: string = req.query.law as string;
    const dbContext = this.getDbContext(dbName);
    const data = await this.model.getMeta(dbContext);
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

  // 단일 단위 전체 조회 (/api/law/unit?law=j&origin=s) — 무료. 연계 없이 한 단의 모든 조문.
  async getUnit(req: Request, res: Response): Promise<void> {
    const dbName: string = req.query.law as string;
    const origin = (req.query.origin as string || '').toLowerCase();
    if (!['a', 'e', 's', 'r', 'b'].includes(origin)) {
      res.status(400).json({ success: false, error: 'origin은 a/e/s/r/b 중 하나여야 합니다.' });
      return;
    }
    const dbContext = this.getDbContext(dbName);
    const data = await this.model.getSingleUnit(dbContext, origin);
    res.status(200).json({ success: true, data });
  }
}
