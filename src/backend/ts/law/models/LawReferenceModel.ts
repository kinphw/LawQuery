import db from '../models/DbContext';

export class LawReferenceModel {
    async getReferenceContent(id: string): Promise<string | null> {
        const rows = await db.query<{ ref_content: string }>(
            'SELECT ref_content FROM db_ref WHERE id_origin = ?', [id]
        );
        return rows.length > 0 ? rows[0].ref_content : null;
    }

    async getReferenceIds(): Promise<string[]> {
        const rows = await db.query<{ id_origin: string }>(
            'SELECT DISTINCT id_origin FROM db_ref'
        );
        return rows.map(row => row.id_origin);
    }
}