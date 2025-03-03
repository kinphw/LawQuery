interface LawResult {
    [key: string]: string;  // Allow string indexing
    law_content: string;
    decree_content: string;
    regulation_content: string;
    rule_content: string;
}

class LawModel {
    constructor(private db: LawDatabase) {}

    getAllLaws(): LawResult[] {
        const query = `
            SELECT 
                a.content_a AS law_content,
                (SELECT GROUP_CONCAT(sub_e.content_e, '|*|') 
                FROM (SELECT DISTINCT e.content_e 
                    FROM db_e e 
                    JOIN rdb_ae ae ON ae.id_e = e.id_e 
                    WHERE ae.id_a = a.id_a) AS sub_e) AS decree_content,
                (SELECT GROUP_CONCAT(sub_s.content_s, '|*|') 
                FROM (SELECT DISTINCT s.content_s 
                    FROM db_s s 
                    JOIN rdb_es es ON es.id_s = s.id_s 
                    JOIN rdb_ae ae ON ae.id_e = es.id_e 
                    WHERE ae.id_a = a.id_a) AS sub_s) AS regulation_content,
                (SELECT GROUP_CONCAT(sub_r.content_r, '|*|') 
                FROM (SELECT DISTINCT r.content_r 
                    FROM db_r r 
                    JOIN rdb_sr sr ON sr.id_r = r.id_r 
                    JOIN rdb_es es ON es.id_s = sr.id_s 
                    JOIN rdb_ae ae ON ae.id_e = es.id_e 
                    WHERE ae.id_a = a.id_a) AS sub_r) AS rule_content
            FROM db_a a
            ORDER BY a.id_a`;

        return this.db.executeQuery(query);
    }
}

window.LawModel = LawModel;