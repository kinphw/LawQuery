import { Request, Response } from 'express';
import db from '../../common/DbContext';
import { BaseLawController } from './BaseLawController';
import { LawReferenceModel } from '../models/LawReferenceModel';


export class ReferenceController extends BaseLawController<LawReferenceModel> {
//   protected model = new LawReferenceModel();

    constructor() {
        super(new LawReferenceModel());
    }

    async getReference(req: Request, res: Response): Promise<void> {

        // 요청별 구조를 읽는다
        const dbName : string = req.query.law as string;
        const lawSteps = req.query.step as string;    
        const dbContext = this.getDbContext(dbName);        

        const id = req.query.id as string;
        if (!id) {
            res.status(400).json({ success: false, error: 'id 파라미터가 필요합니다.' });
            return;
        }
        const ref_content = await this.model.getReferenceContent(dbContext, id);
        res.json({ success: true, data: ref_content });
    }

    async getReferenceIds(req: Request, res: Response): Promise<void> {

        // 요청별 구조를 읽는다
        const dbName : string = req.query.law as string;
        const lawSteps = req.query.step as string;    
        const dbContext = this.getDbContext(dbName);        

        const ids = await this.model.getReferenceIds(dbContext);
        res.json({ success: true, data: ids });
    }
}