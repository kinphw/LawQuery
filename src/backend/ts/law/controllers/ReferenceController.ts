import { Request, Response } from 'express';
import db from '../../common/DbContext';
import { LawReferenceModel } from '../models/LawReferenceModel';


export class ReferenceController {
  private model = new LawReferenceModel();

  async getReference(req: Request, res: Response): Promise<void> {
      const id = req.query.id as string;
      if (!id) {
          res.status(400).json({ success: false, error: 'id 파라미터가 필요합니다.' });
          return;
      }
      const ref_content = await this.model.getReferenceContent(id);
      res.json({ success: true, data: ref_content });
  }

  async getReferenceIds(req: Request, res: Response): Promise<void> {
      const ids = await this.model.getReferenceIds();
      res.json({ success: true, data: ids });
  }
}