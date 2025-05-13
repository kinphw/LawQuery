import { Request, Response } from 'express';
import db from '../models/DbContext';

export class ReferenceController {
  async getReference(req: Request, res: Response): Promise<void> {
    const id = req.query.id as string;
    if (!id) {
      res.status(400).json({ success: false, error: 'id 파라미터가 필요합니다.' });
      return;
    }
    const rows = await db.query<{ ref_content: string }>(
      'SELECT ref_content FROM db_ref WHERE id_origin = ?', [id]
    );
    if (rows.length === 0) {
      res.json({ success: true, data: null });
    } else {
      res.json({ success: true, data: rows[0].ref_content });
    }
  }

  async getReferenceIds(req: Request, res: Response): Promise<void> {
    const rows = await db.query<{ id_origin: string }>('SELECT DISTINCT id_origin FROM db_ref');
    const ids = rows.map(row => row.id_origin);
    res.json({ success: true, data: ids });
  }
}