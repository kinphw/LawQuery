import DbContext from '../../common/DbContext';
import { LawBaseModel } from './LawBaseModel';

export class LawReferenceModel extends LawBaseModel {

    // private db: DbContext;
    // constructor() {
    //     this.db = DbContext.getInstance('ldb_j'); // 'ldb_j'는 법률 데이터베이스의 이름
    // }

    async getReferenceContent(dbContext: DbContext, id: string): Promise<{ texts: string[], annexes: string[] }> {
        this.setDbContext(dbContext); // DbContext 설정
        const rows = await this.db.query<{ ref_type: string, ref_content: string }>(
            `SELECT 
                ref_type,
                CASE 
                    WHEN ref_type = 'text' THEN ref_content
                    WHEN ref_type = 'annex_link' THEN ref_content
                    WHEN ref_type = 'db_a' THEN CONCAT('[법]\n', (SELECT content_a FROM db_a WHERE id_a = ref_target))
                    WHEN ref_type = 'db_e' THEN CONCAT('[시행령]\n', (SELECT content_e FROM db_e WHERE id_e = ref_target))
                    WHEN ref_type = 'db_s' THEN CONCAT('[규정]\n', (SELECT content_s FROM db_s WHERE id_s = ref_target))
                    WHEN ref_type = 'db_r' THEN CONCAT('[시행세칙]\n', (SELECT content_r FROM db_r WHERE id_r = ref_target))
                    ELSE NULL
                END AS ref_content
            FROM db_ref
            WHERE id_origin = ?
            ORDER BY id
            `,
            [id]
        );

        const texts: string[] = [];
        const annexes: string[] = [];

        rows.forEach(row => {
            if (row.ref_content) {
                if (row.ref_type === 'annex_link') {
                    annexes.push(row.ref_content);
                } else {
                    texts.push(row.ref_content);
                }
            }
        });

        return { texts, annexes };
    }

    async getReferenceIds(dbContext: DbContext): Promise<{ [key: string]: { hasText: boolean, annexes: string[] } }> {
        this.setDbContext(dbContext); // DbContext 설정

        // 250624 수정: 단순 ID 목록이 아니라 상세 정보(텍스트 유무, 별표 링크) 반환
        const rows = await this.db.query<{ id_origin: string, ref_type: string, ref_content: string }>(
            'SELECT id_origin, ref_type, ref_content FROM db_ref'
        );

        const result: { [key: string]: { hasText: boolean, annexes: string[] } } = {};

        rows.forEach(row => {
            if (!result[row.id_origin]) {
                result[row.id_origin] = { hasText: false, annexes: [] };
            }

            if (row.ref_type === 'annex_link') {
                result[row.id_origin].annexes.push(row.ref_content); // URL 저장
            } else {
                result[row.id_origin].hasText = true; // 텍스트 참조가 있음을 표시
            }
        });

        return result;
    }
}