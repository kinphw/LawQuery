import { Request, Response } from 'express';
import { BaseLawController } from './BaseLawController';
import { LawModel } from '../models/LawModel';
import { LawPenaltyModel } from '../models/LawPenaltyModel';

export class PenaltyController extends BaseLawController<LawPenaltyModel> {

  constructor() {
    super(new LawPenaltyModel());
  }
  async getPenalty(req : Request, res: Response): Promise<void> {

    // 요청별 구조를 읽는다
    const dbName : string = req.query.law as string;
    const lawSteps = req.query.step as string;    
    const dbContext = this.getDbContext(dbName);

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
      dbContext,
      id_a.length > 0 ? id_a : undefined,
      sortByPenalty
    );
    // res.status(200).json(data);
    res.status(200).json({ success: true, data });
  }

  async getPenaltyIds(req : Request, res: Response): Promise<void> {

    // 요청별 구조를 읽는다
    const dbName : string = req.query.law as string;
    const lawSteps = req.query.step as string;    
    const dbContext = this.getDbContext(dbName);

    const data = await this.model.getPenaltyIds(dbContext);   
    res.status(200).json({ success: true, data });
  }


}