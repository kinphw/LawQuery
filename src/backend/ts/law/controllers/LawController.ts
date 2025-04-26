// import { IncomingMessage, ServerResponse } from 'http';
import { Request, Response } from 'express';
// import { LawService } from '../services/LawService';
import { LawModel } from '../models/LawModel';

export class LawController {
  // private service: LawService;
  private model: LawModel;

  constructor() {
    // this.service = new LawService();
    this.model = new LawModel();
  }

  // async getAll(req: IncomingMessage, res: ServerResponse) {
  async getAll(req: Request, res: Response): Promise<void> {  
    // const data = await this.service.getAllLaws();
    const data = await this.model.getAllLaws();
    // res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    // res.end(JSON.stringify({ success: true, data }));
    // res.end(JSON.stringify(data)); // 그냥 간단하게 내보낸다...
    res.status(200).json({ success: true, data });
  }

  // async getByIds(req: IncomingMessage, res: ServerResponse, lawIds: string[] | null) {
  async getByIds(req: Request, res: Response): Promise<void> {  

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
    const data = await this.model.getLawByIds(lawIds);
    // res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    // res.end(JSON.stringify(data));
    // res.status(200).json(data);
    res.status(200).json({ success: true, data });
  }

  // 법령 제목만 긁어오는 메서드
  async getTitles(req: Request, res: Response): Promise<void> {
    const data = await this.model.getLawTitles();
    // res.status(200).json(data);
    res.status(200).json({ success: true, data });
  }
}
