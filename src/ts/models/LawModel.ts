interface LawResult {
    법령ID: string;
    법령명: string;
    조문번호: string;
    조문제목: string;
    조문내용: string;
}

class LawModel {
    constructor(private db: LawDatabase) {}

    getRelatedLaws(lawId: string): LawResult[] {
        const query = `
            WITH RECURSIVE related_laws AS (
                -- 시작 법령
                SELECT a.* FROM A WHERE 법령ID = ?
                UNION
                -- 시행령
                SELECT e.* FROM E e
                INNER JOIN AE ae ON e.법령ID = ae.시행령ID
                WHERE ae.법령ID = ?
                UNION
                -- 감독규정
                SELECT s.* FROM S s
                INNER JOIN ES es ON s.법령ID = es.감독규정ID
                WHERE es.시행령ID IN (
                    SELECT 시행령ID FROM AE WHERE 법령ID = ?
                )
                UNION
                -- 시행세칙
                SELECT r.* FROM R r
                INNER JOIN SR sr ON r.법령ID = sr.시행세칙ID
                WHERE sr.감독규정ID IN (
                    SELECT 감독규정ID FROM ES
                    WHERE 시행령ID IN (
                        SELECT 시행령ID FROM AE WHERE 법령ID = ?
                    )
                )
            )
            SELECT * FROM related_laws
            ORDER BY 법령구분, 조문번호
        `;
        
        return this.db.executeQuery(query, [lawId, lawId, lawId, lawId]);
    }
}

window.LawModel = LawModel;