interface LawResult {
    [key: string]: string | null;  // Allow string indexing
    id_a: string | null;    // Add id_a field
    law_content: string;
    decree_content: string;
    regulation_content: string;
    rule_content: string;
}

class LawModel {
    constructor(private db: LawDatabase) {}

    // 최초에 모든 법을 다 긁어서 보일때 사용
    getAllLaws(): LawResult[] {

        const query = `
        SELECT
        a.id_a, 
        a.content_a AS law_content,
    
        /* 시행령 (id_e 순으로 정렬) */
        (
          SELECT group_concat(sub_e.content_e, '|*|')
          FROM (
            SELECT DISTINCT e.content_e
            FROM db_e e
            JOIN rdb_ae ae ON ae.id_e = e.id_e
            WHERE ae.id_a = a.id_a
            ORDER BY e.id     -- 여기서 원하는 순서대로 정렬
          ) AS sub_e
        ) AS decree_content,
    
        /* 감독규정 (id_s 순으로 정렬) */
        (
          SELECT group_concat(sub_s.content_s, '|*|')
          FROM (
            SELECT DISTINCT s.content_s
            FROM db_s s
            JOIN rdb_es es ON es.id_s = s.id_s
            JOIN rdb_ae ae ON ae.id_e = es.id_e
            WHERE ae.id_a = a.id_a
            ORDER BY s.id     -- 여기서 정렬
          ) AS sub_s
        ) AS regulation_content,
    
        /* 시행세칙 (id_r 순으로 정렬) */
        (
          SELECT group_concat(sub_r.content_r, '|*|')
          FROM (
            SELECT DISTINCT r.content_r
            FROM db_r r
            JOIN rdb_sr sr ON sr.id_r = r.id_r
            JOIN rdb_es es ON es.id_s = sr.id_s
            JOIN rdb_ae ae ON ae.id_e = es.id_e
            WHERE ae.id_a = a.id_a
            ORDER BY r.id     -- 정렬
          ) AS sub_r
        ) AS rule_content
    
    FROM db_a a    
    ORDER BY a.id`;

        return this.db.executeQuery(query);
    }

    // 체크박스에서 ID별로 조회할때 사용
    getLawsByIds(lawIds: string[]): LawResult[] {
        if (!lawIds.length) return [];
        
        const query = `
        SELECT
        a.id_a, 
        a.content_a AS law_content,
    
        /* 시행령 (id_e 순으로 정렬) */
        (
          SELECT group_concat(sub_e.content_e, '|*|')
          FROM (
            SELECT DISTINCT e.content_e
            FROM db_e e
            JOIN rdb_ae ae ON ae.id_e = e.id_e
            WHERE ae.id_a = a.id_a
            ORDER BY e.id     -- 여기서 원하는 순서대로 정렬
          ) AS sub_e
        ) AS decree_content,
    
        /* 감독규정 (id_s 순으로 정렬) */
        (
          SELECT group_concat(sub_s.content_s, '|*|')
          FROM (
            SELECT DISTINCT s.content_s
            FROM db_s s
            JOIN rdb_es es ON es.id_s = s.id_s
            JOIN rdb_ae ae ON ae.id_e = es.id_e
            WHERE ae.id_a = a.id_a
            ORDER BY s.id     -- 여기서 정렬
          ) AS sub_s
        ) AS regulation_content,
    
        /* 시행세칙 (id_r 순으로 정렬) */
        (
          SELECT group_concat(sub_r.content_r, '|*|')
          FROM (
            SELECT DISTINCT r.content_r
            FROM db_r r
            JOIN rdb_sr sr ON sr.id_r = r.id_r
            JOIN rdb_es es ON es.id_s = sr.id_s
            JOIN rdb_ae ae ON ae.id_e = es.id_e
            WHERE ae.id_a = a.id_a
            ORDER BY r.id     -- 정렬
          ) AS sub_r
        ) AS rule_content
    
    FROM db_a a    
    WHERE a.id_a IN (${lawIds.map(() => '?').join(',')})       
    ORDER BY a.id`;

        return this.db.executeQuery(query, lawIds);
    }    
    getLawTitles(): Array<LawTitle> {
        const query = `
            SELECT 
                id_a, 
                title_a,
                CASE WHEN id_a IS NULL THEN 1 ELSE 0 END as isTitle 
            FROM db_a 
            ORDER BY id
        `;
        return this.db.executeQuery(query);
    }  

}

window.LawModel = LawModel;