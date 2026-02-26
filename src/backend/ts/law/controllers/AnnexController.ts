import { Request, Response } from 'express';
import { BaseLawController } from './BaseLawController';
import { LawAnnexModel } from '../models/LawAnnexModel';

export class AnnexController extends BaseLawController<LawAnnexModel> {
    constructor() {
        super(new LawAnnexModel());
    }

    async getAnnex(req: Request, res: Response): Promise<void> {
        const dbName: string = req.query.law as string;
        const dbContext = this.getDbContext(dbName);
        const id_src = Array.isArray(req.query.id_src)
            ? req.query.id_src as string[]
            : req.query.id_src ? [req.query.id_src as string] : [];

        const data = await this.model.getAnnex(dbContext, id_src.length > 0 ? id_src : undefined);
        res.status(200).json({ success: true, data });
    }

    async getAnnexIds(req: Request, res: Response): Promise<void> {
        const dbName: string = req.query.law as string;
        const dbContext = this.getDbContext(dbName);
        const data = await this.model.getAnnexIds(dbContext);
        res.status(200).json({ success: true, data });
    }
}
