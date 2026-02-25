// import { IncomingMessage, ServerResponse } from 'http';
import { Request, Response } from 'express';
import { BaseLawController } from './BaseLawController';
// import { LawService } from '../services/LawService';
import { LawModel } from '../models/LawModel';
import DbContext from '../../common/DbContext';

export class LawController extends BaseLawController<LawModel> {
  // private service: LawService;
  // private model: LawModel;

  constructor() {
    super(new LawModel());
  }

  // /all
  async getAll(req: Request, res: Response): Promise<void> {

    // 요청별 구조를 읽는다
    const dbName: string = req.query.law as string;
    const step: number = parseInt(req.query.step as string);
    const dbContext = this.getDbContext(dbName);

    // const data = await this.service.getAllLaws();
    const dataTemp = await this.model.getAllLaws(dbContext, step);
    const data = this.model.toLawTree(dataTemp);

    // res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    // res.end(JSON.stringify({ success: true, data }));
    // res.end(JSON.stringify(data)); // 그냥 간단하게 내보낸다...
    res.status(200).json({ success: true, data });
  }

  // async getByIds(req: IncomingMessage, res: ServerResponse, lawIds: string[] | null) {
  async getByIds(req: Request, res: Response): Promise<void> {

    // 요청별 구조를 읽는다
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
}
