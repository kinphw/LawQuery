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
    const dataTemp = await this.model.getAllLaws();
    const data = this.model.toLawTree(dataTemp);
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
    const dataTemp = await this.model.getLawByIds(lawIds);
    const data = this.model.toLawTree(dataTemp);    
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

  async getPenalty(req : Request, res: Response): Promise<void> {

    // req.query.id를 배열로 변환 // 250506
    const id_a = Array.isArray(req.query.id_a)
        ? req.query.id_a as string[]
        : req.query.id_a
        ? [req.query.id_a as string]
        : [];    

    // 정렬 방식 명시적으로 결정 (sortBy=penalty 또는 sortBy=cause)
    let sortByPenalty = false; // 기본값: 원인순 (false)

    if (req.query.sortBy) {
        const sortParam = req.query.sortBy as string;
        if (sortParam === 'penalty') {
            sortByPenalty = true; // 벌칙순 정렬
        } else if (sortParam === 'cause') {
            sortByPenalty = false; // 원인순 정렬
        }
    }

    // const data = await this.model.getPenalty();
    // id_a가 비어 있으면 전체, 아니면 해당 id만
    const data = await this.model.getPenalty(
      id_a.length > 0 ? id_a : undefined,
      sortByPenalty
    );
    // res.status(200).json(data);
    res.status(200).json({ success: true, data });
  }

  async getPenaltyIds(req : Request, res: Response): Promise<void> {
    const data = await this.model.getPenaltyIds();   
    res.status(200).json({ success: true, data });
  }

}
