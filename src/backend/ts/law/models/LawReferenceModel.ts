import DbContext from '../../common/DbContext';
import { LawBaseModel } from './LawBaseModel';

export class LawReferenceModel extends LawBaseModel {

    // private db: DbContext;
    // constructor() {
    //     this.db = DbContext.getInstance('ldb_j'); // 'ldb_j'는 법률 데이터베이스의 이름
    // }

    async getReferenceContent(dbContext: DbContext, id: string): Promise<{ items: { type: string, content: string }[] }> {
        this.setDbContext(dbContext); // DbContext 설정
        const rows = await this.db.query<{ ref_type: string, ref_content: string }>(
            `SELECT
                ref_type,
                CASE
                    WHEN ref_type = 'text' THEN ref_content
                    WHEN ref_type = 'db_a' THEN (SELECT content_a FROM db_a WHERE id_a = ref_target)
                    WHEN ref_type = 'db_e' THEN (SELECT content_e FROM db_e WHERE id_e = ref_target)
                    WHEN ref_type = 'db_s' THEN (SELECT content_s FROM db_s WHERE id_s = ref_target)
                    WHEN ref_type = 'db_r' THEN (SELECT content_r FROM db_r WHERE id_r = ref_target)
                    ELSE NULL
                END AS ref_content
            FROM db_ref
            WHERE id_origin = ?
            ORDER BY id
            `,
            [id]
        );

        const items = rows
            .filter(row => row.ref_content)
            .map(row => ({ type: row.ref_type, content: row.ref_content }));
        return { items };
    }

    async getReferenceIds(dbContext: DbContext): Promise<{ [key: string]: { hasText: boolean } }> {
        this.setDbContext(dbContext); // DbContext 설정

        // 250624 수정: 단순 ID 목록이 아니라 상세 정보(텍스트 유무, 별표 링크) 반환
        const rows = await this.db.query<{ id_origin: string, ref_type: string, ref_content: string }>(
            'SELECT id_origin, ref_type, ref_content FROM db_ref'
        );

        const result: { [key: string]: { hasText: boolean } } = {};
        rows.forEach(row => {
            result[row.id_origin] = { hasText: true };
        });
        return result;
    }
}