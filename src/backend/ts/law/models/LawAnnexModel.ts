import { LawBaseModel } from './LawBaseModel';
import { LawAnnex } from '../types/LawAnnex';
import DbContext from '../../common/DbContext';

export class LawAnnexModel extends LawBaseModel {
    async getAnnex(dbContext: DbContext, id_src?: string[]): Promise<LawAnnex[]> {
        this.setDbContext(dbContext);
        const baseQuery = `
          SELECT id, id_src, origin, id_annex, annex_no, annex_name, annex_url
          FROM db_annex
          WHERE 1=1
        `;
        let query = baseQuery;
        let params: any[] = [];

        if (id_src && id_src.length > 0) {
            const placeholders = id_src.map(() => '?').join(',');
            query += ` AND id_src IN (${placeholders})`;
            params = id_src;
        }

        query += ` ORDER BY origin, id_annex, id`;
        return await this.db.query<LawAnnex>(query, params);
    }

    // 법령 테이블 출력을 위해 별표를 가지고 있는 모든 id_src를 반환합니다.
    async getAnnexIds(dbContext: DbContext): Promise<string[]> {
        this.setDbContext(dbContext);
        const query = `
            SELECT DISTINCT id_src 
            FROM db_annex
        `;
        const rows = await this.db.query<{ id_src: string }>(query);
        return rows.map(row => row.id_src);
    }
}
