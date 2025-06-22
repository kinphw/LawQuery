import DbContext from '../../common/DbContext';
import {LawBaseModel} from './LawBaseModel';

export class LawReferenceModel extends LawBaseModel {

    // private db: DbContext;
    // constructor() {
    //     this.db = DbContext.getInstance('ldb_j'); // 'ldb_j'는 법률 데이터베이스의 이름
    // }

    async getReferenceContent(dbContext: DbContext, id: string): Promise<string[] | null> {
        // const rows = await db.query<{ ref_content: string }>(
        //     'SELECT ref_content FROM db_ref WHERE id_origin = ?', [id]
        // );

        this.setDbContext(dbContext); // DbContext 설정
        const rows = await this.db.query<{ ref_content: string }>(
            `SELECT 
                CASE 
                    WHEN ref_type = 'text' THEN ref_content
                    WHEN ref_type = 'db_a' THEN CONCAT('[법]\n', (SELECT content_a FROM db_a WHERE id_a = ref_target))
                    WHEN ref_type = 'db_e' THEN CONCAT('[시행령]\n', (SELECT content_e FROM db_e WHERE id_e = ref_target))
                    WHEN ref_type = 'db_s' THEN CONCAT('[규정]\n', (SELECT content_s FROM db_s WHERE id_s = ref_target))
                    WHEN ref_type = 'db_r' THEN CONCAT('[시행세칙]\n', (SELECT content_r FROM db_r WHERE id_r = ref_target))
                    ELSE NULL
                END AS ref_content
            FROM db_ref
            WHERE id_origin = ?
            order by id
            `,
            [id]
        );

        // return rows.length > 0 ? rows[0].ref_content : null;
        return rows.map(row => row.ref_content); // 여러 레코드 반환
    }

    async getReferenceIds(dbContext: DbContext): Promise<string[]> {
        this.setDbContext(dbContext); // DbContext 설정
        const rows = await this.db.query<{ id_origin: string }>(
            'SELECT DISTINCT id_origin FROM db_ref'
        );
        return rows.map(row => row.id_origin);
    }
}