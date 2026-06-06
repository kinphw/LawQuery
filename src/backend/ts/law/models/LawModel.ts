// import db from './DbContext'; // pool → db로 변경

import { LawBaseModel } from './LawBaseModel';
import type { RowDataPacket } from 'mysql2'; // ✅ 완전 OK
import type { LawResult } from '../types/LawResult';
// import { LawTitle } from '../types/LawTitle';
import { LawTitle } from '../types/LawTitle';
import { LawTreeNode } from '../types/LawTreeNode';
import { LawPenalty } from "../types/LawPenalty"; // 250504
import { TreeConverter } from '../utils/TreeConverter';
import DbContext from '../../common/DbContext';

export class LawModel extends LawBaseModel {

  async getAllLaws(dbContext: DbContext, step: number = 4): Promise<LawResult[]> {

    this.setDbContext(dbContext); // DbContext 설정

    let query: string = '';

    if (step === 4) {
      query = `
      WITH RECURSIVE paths AS (
        SELECT
          a.id_aa,
          a.seq AS ida,
          a.id_a,
          a.content_a AS law_content,
          a.content_a_sched AS law_content_sched,
          a.sched_date AS law_sched_date,
          a.id_a AS current_node,
          CAST(NULL AS CHAR(100)) AS id_e,
          CAST(NULL AS CHAR(100)) AS id_s,
          CAST(NULL AS CHAR(100)) AS id_r,
          0 AS depth
        FROM db_a a
        WHERE a.id_a IS NOT NULL

        UNION ALL

        SELECT
          p.id_aa, p.ida, p.id_a, p.law_content,
          p.law_content_sched,
          p.law_sched_date,
          rdb.id_end,
          CASE WHEN rdb.id_end LIKE 'E%' THEN rdb.id_end ELSE p.id_e END,
          CASE WHEN rdb.id_end LIKE 'S%' THEN rdb.id_end ELSE p.id_s END,
          CASE WHEN rdb.id_end LIKE 'R%' THEN rdb.id_end ELSE p.id_r END,
          p.depth + 1
        FROM paths p
        JOIN rdb ON rdb.id_start = p.current_node
        WHERE p.depth < 3
          AND (
            (p.current_node LIKE 'A%' AND (rdb.id_end LIKE 'E%' OR rdb.id_end LIKE 'S%' OR rdb.id_end LIKE 'R%'))
            OR (p.current_node LIKE 'E%' AND (rdb.id_end LIKE 'S%' OR rdb.id_end LIKE 'R%'))
            OR (p.current_node LIKE 'S%' AND rdb.id_end LIKE 'R%')
          )
      )
      SELECT * FROM (
        SELECT
          p.id_aa, p.id_a, p.law_content,
          p.law_content_sched,
          p.id_e, e.content_e AS decree_content,
          e.content_e_sched AS decree_content_sched,
          p.id_s, s.content_s AS regulation_content,
          s.content_s_sched AS regulation_content_sched,
          p.id_r, r.content_r AS rule_content,
          r.content_r_sched AS rule_content_sched,
          p.law_sched_date,
          e.sched_date AS decree_sched_date,
          s.sched_date AS regulation_sched_date,
          r.sched_date AS rule_sched_date,
          e.seq AS ide,
          s.seq AS ids,
          r.seq AS idr,
          p.ida,
          COUNT(*) OVER (PARTITION BY p.id_a) AS a_count
        FROM paths p
        LEFT JOIN db_e e ON e.id_e = p.id_e
        LEFT JOIN db_s s ON s.id_s = p.id_s
        LEFT JOIN db_r r ON r.id_r = p.id_r
        WHERE NOT EXISTS (
          SELECT 1 FROM rdb
          WHERE id_start = p.current_node
            AND (
              (p.current_node LIKE 'A%' AND (id_end LIKE 'E%' OR id_end LIKE 'S%' OR id_end LIKE 'R%'))
              OR (p.current_node LIKE 'E%' AND (id_end LIKE 'S%' OR id_end LIKE 'R%'))
              OR (p.current_node LIKE 'S%' AND id_end LIKE 'R%')
            )
        )
      ) t
      WHERE
        NOT (
          t.law_content IS NOT NULL
          AND t.decree_content IS NULL
          AND t.regulation_content IS NULL
          AND t.rule_content IS NULL
          AND t.a_count > 1
        )

      UNION ALL

      SELECT
        a.id_aa, NULL, a.content_a,
        NULL,
        NULL, NULL, NULL,
        NULL, NULL, NULL,
        NULL, NULL, NULL,
        NULL, NULL, NULL, NULL,
        NULL, NULL, NULL,
        a.seq AS ida,
        1 AS a_count
      FROM db_a a
      WHERE a.id_a IS NULL AND a.title_a IS NOT NULL

      ORDER BY
        ida,
        ide,
        ids,
        idr;
      `;
    };

    if (step === 5) {
      query = `
      WITH RECURSIVE paths AS (
        SELECT
          a.id_aa,
          a.seq AS ida,
          a.id_a,
          a.content_a AS law_content,
          a.content_a_sched AS law_content_sched,
          a.sched_date AS law_sched_date,
          a.id_a AS current_node,
          CAST(NULL AS CHAR(100)) AS id_e,
          CAST(NULL AS CHAR(100)) AS id_s,
          CAST(NULL AS CHAR(100)) AS id_r,
          CAST(NULL AS CHAR(100)) AS id_b,
          0 AS depth
        FROM db_a a
        WHERE a.id_a IS NOT NULL

        UNION ALL

        SELECT
          p.id_aa, p.ida, p.id_a, p.law_content,
          p.law_content_sched,
          p.law_sched_date,
          rdb.id_end,
          CASE WHEN rdb.id_end LIKE 'E%' THEN rdb.id_end ELSE p.id_e END,
          CASE WHEN rdb.id_end LIKE 'S%' THEN rdb.id_end ELSE p.id_s END,
          CASE WHEN rdb.id_end LIKE 'R%' THEN rdb.id_end ELSE p.id_r END,
          CASE WHEN rdb.id_end LIKE 'B%' THEN rdb.id_end ELSE p.id_b END,
          p.depth + 1
        FROM paths p
        JOIN rdb ON rdb.id_start = p.current_node
        WHERE p.depth < 4
          AND (
            (p.current_node LIKE 'A%' AND (rdb.id_end LIKE 'E%' OR rdb.id_end LIKE 'S%' OR rdb.id_end LIKE 'R%' OR rdb.id_end LIKE 'B%'))
            OR (p.current_node LIKE 'E%' AND (rdb.id_end LIKE 'S%' OR rdb.id_end LIKE 'R%' OR rdb.id_end LIKE 'B%'))
            OR (p.current_node LIKE 'S%' AND (rdb.id_end LIKE 'R%' OR rdb.id_end LIKE 'B%'))
            OR (p.current_node LIKE 'R%' AND rdb.id_end LIKE 'B%')
          )
      )
      SELECT * FROM (
        SELECT
          p.id_aa, p.id_a, p.law_content,
          p.law_content_sched,
          p.id_e, e.content_e AS decree_content,
          e.content_e_sched AS decree_content_sched,
          p.id_s, s.content_s AS regulation_content,
          s.content_s_sched AS regulation_content_sched,
          p.id_r, r.content_r AS rule_content,
          r.content_r_sched AS rule_content_sched,
          p.id_b, b.content_b AS book_content,
          b.content_b_sched AS book_content_sched,
          p.law_sched_date,
          e.sched_date AS decree_sched_date,
          s.sched_date AS regulation_sched_date,
          r.sched_date AS rule_sched_date,
          b.sched_date AS book_sched_date,
          e.seq AS ide,
          s.seq AS ids,
          r.seq AS idr,
          b.seq AS idb,
          p.ida,
          COUNT(*) OVER (PARTITION BY p.id_a) AS a_count
        FROM paths p
        LEFT JOIN db_e e ON e.id_e = p.id_e
        LEFT JOIN db_s s ON s.id_s = p.id_s
        LEFT JOIN db_r r ON r.id_r = p.id_r
        LEFT JOIN db_b b ON b.id_b = p.id_b
        WHERE NOT EXISTS (
          SELECT 1 FROM rdb
          WHERE id_start = p.current_node
            AND (
              (p.current_node LIKE 'A%' AND (id_end LIKE 'E%' OR id_end LIKE 'S%' OR id_end LIKE 'R%' OR id_end LIKE 'B%'))
              OR (p.current_node LIKE 'E%' AND (id_end LIKE 'S%' OR id_end LIKE 'R%' OR id_end LIKE 'B%'))
              OR (p.current_node LIKE 'S%' AND (id_end LIKE 'R%' OR id_end LIKE 'B%'))
              OR (p.current_node LIKE 'R%' AND id_end LIKE 'B%')
            )
        )
      ) t
      WHERE
        NOT (
          t.law_content IS NOT NULL
          AND t.decree_content IS NULL
          AND t.regulation_content IS NULL
          AND t.rule_content IS NULL
          AND t.book_content IS NULL
          AND t.a_count > 1
        )

      UNION ALL

      SELECT
        a.id_aa, NULL, a.content_a,
        NULL,
        NULL, NULL, NULL,
        NULL, NULL, NULL,
        NULL, NULL, NULL,
        NULL, NULL, NULL,
        NULL, NULL, NULL, NULL, NULL,
        NULL, NULL, NULL, NULL,
        a.seq AS ida,
        1 AS a_count
      FROM db_a a
      WHERE a.id_a IS NULL AND a.title_a IS NOT NULL

      ORDER BY
        ida,
        ide,
        ids,
        idr,
        idb;
      `;
    }
    const rows = await this.db.query<LawResult>(query);
    return rows;
  }

  /**
   * 단일 단위(법/시행령/감독규정/시행세칙) 전체 조회 — 연계 없이 한 단의 모든 조문을 seq 순으로.
   * 무료 기능: 하위규정이 분산돼 외부에서 통째 보기 어려운 걸 한 화면에. (origin: a/e/s/r)
   */
  async getSingleUnit(dbContext: DbContext, origin: string): Promise<any[]> {
    this.setDbContext(dbContext);
    const map: Record<string, { tbl: string; id: string; content: string; sched: string }> = {
      a: { tbl: 'db_a', id: 'id_a', content: 'content_a', sched: 'content_a_sched' },
      e: { tbl: 'db_e', id: 'id_e', content: 'content_e', sched: 'content_e_sched' },
      s: { tbl: 'db_s', id: 'id_s', content: 'content_s', sched: 'content_s_sched' },
      r: { tbl: 'db_r', id: 'id_r', content: 'content_r', sched: 'content_r_sched' },
    };
    const m = map[origin];
    if (!m) return [];
    // 법(db_a)은 제목행(id_a IS NULL, title_a)도 포함해 구조를 살린다. 나머지는 id 있는 조문만.
    const query = origin === 'a'
      ? `SELECT seq, id_a AS id, title_a AS title, content_a AS content, content_a_sched AS content_sched, sched_date
         FROM db_a WHERE content_a IS NOT NULL OR title_a IS NOT NULL ORDER BY seq`
      : `SELECT seq, ${m.id} AS id, ${m.content} AS content, ${m.sched} AS content_sched, sched_date
         FROM ${m.tbl} WHERE ${m.content} IS NOT NULL ORDER BY seq`;
    return this.db.query<any>(query);
  }


  async getLawByIds(dbContext: DbContext, step: number, lawIds: string[]): Promise<LawResult[]> {

    this.setDbContext(dbContext); // DbContext 설정    
    if (!lawIds.length) return [];

    const placeholders = new Array(lawIds.length).fill('?').join(',');

    let query = '';
    if (step === 4) {
      query = `
      WITH RECURSIVE paths AS (
        SELECT
          a.id_aa,
          a.seq AS ida,
          a.id_a,
          a.content_a AS law_content,
          a.content_a_sched AS law_content_sched,
          a.sched_date AS law_sched_date,
          a.id_a AS current_node,
          CAST(NULL AS CHAR(100)) AS id_e,
          CAST(NULL AS CHAR(100)) AS id_s,
          CAST(NULL AS CHAR(100)) AS id_r,
          0 AS depth
        FROM db_a a
        WHERE a.id_a IS NOT NULL AND a.id_aa IN (${placeholders})

        UNION ALL

        SELECT
          p.id_aa, p.ida, p.id_a, p.law_content,
          p.law_content_sched,
          p.law_sched_date,
          rdb.id_end,
          CASE WHEN rdb.id_end LIKE 'E%' THEN rdb.id_end ELSE p.id_e END,
          CASE WHEN rdb.id_end LIKE 'S%' THEN rdb.id_end ELSE p.id_s END,
          CASE WHEN rdb.id_end LIKE 'R%' THEN rdb.id_end ELSE p.id_r END,
          p.depth + 1
        FROM paths p
        JOIN rdb ON rdb.id_start = p.current_node
        WHERE p.depth < 3
          AND (
            (p.current_node LIKE 'A%' AND (rdb.id_end LIKE 'E%' OR rdb.id_end LIKE 'S%' OR rdb.id_end LIKE 'R%'))
            OR (p.current_node LIKE 'E%' AND (rdb.id_end LIKE 'S%' OR rdb.id_end LIKE 'R%'))
            OR (p.current_node LIKE 'S%' AND rdb.id_end LIKE 'R%')
          )
      )
      SELECT * FROM (
        SELECT
          p.id_aa, p.id_a, p.law_content,
          p.law_content_sched,
          p.id_e, e.content_e AS decree_content,
          e.content_e_sched AS decree_content_sched,
          p.id_s, s.content_s AS regulation_content,
          s.content_s_sched AS regulation_content_sched,
          p.id_r, r.content_r AS rule_content,
          r.content_r_sched AS rule_content_sched,
          p.law_sched_date,
          e.sched_date AS decree_sched_date,
          s.sched_date AS regulation_sched_date,
          r.sched_date AS rule_sched_date,
          e.seq AS ide,
          s.seq AS ids,
          r.seq AS idr,
          p.ida,
          COUNT(*) OVER (PARTITION BY p.id_a) AS a_count
        FROM paths p
        LEFT JOIN db_e e ON e.id_e = p.id_e
        LEFT JOIN db_s s ON s.id_s = p.id_s
        LEFT JOIN db_r r ON r.id_r = p.id_r
        WHERE NOT EXISTS (
          SELECT 1 FROM rdb
          WHERE id_start = p.current_node
            AND (
              (p.current_node LIKE 'A%' AND (id_end LIKE 'E%' OR id_end LIKE 'S%' OR id_end LIKE 'R%'))
              OR (p.current_node LIKE 'E%' AND (id_end LIKE 'S%' OR id_end LIKE 'R%'))
              OR (p.current_node LIKE 'S%' AND id_end LIKE 'R%')
            )
        )
      ) t
      WHERE
        NOT (
          t.law_content IS NOT NULL
          AND t.decree_content IS NULL
          AND t.regulation_content IS NULL
          AND t.rule_content IS NULL
          AND t.a_count > 1
        )

      UNION ALL

      SELECT
        a.id_aa, NULL, a.content_a,
        NULL,
        NULL, NULL, NULL,
        NULL, NULL, NULL,
        NULL, NULL, NULL,
        NULL, NULL, NULL, NULL,
        NULL, NULL, NULL,
        a.seq AS ida,
        1 AS a_count
      FROM db_a a
      WHERE a.id_a IS NULL AND a.title_a IS NOT NULL AND a.id_aa IN (${placeholders})

      ORDER BY
        ida,
        ide,
        ids,
        idr;
      `;
    } else if (step === 5) {
      query = `
      WITH RECURSIVE paths AS (
        SELECT
          a.id_aa,
          a.seq AS ida,
          a.id_a,
          a.content_a AS law_content,
          a.content_a_sched AS law_content_sched,
          a.sched_date AS law_sched_date,
          a.id_a AS current_node,
          CAST(NULL AS CHAR(100)) AS id_e,
          CAST(NULL AS CHAR(100)) AS id_s,
          CAST(NULL AS CHAR(100)) AS id_r,
          CAST(NULL AS CHAR(100)) AS id_b,
          0 AS depth
        FROM db_a a
        WHERE a.id_a IS NOT NULL AND a.id_aa IN (${placeholders})

        UNION ALL

        SELECT
          p.id_aa, p.ida, p.id_a, p.law_content,
          p.law_content_sched,
          p.law_sched_date,
          rdb.id_end,
          CASE WHEN rdb.id_end LIKE 'E%' THEN rdb.id_end ELSE p.id_e END,
          CASE WHEN rdb.id_end LIKE 'S%' THEN rdb.id_end ELSE p.id_s END,
          CASE WHEN rdb.id_end LIKE 'R%' THEN rdb.id_end ELSE p.id_r END,
          CASE WHEN rdb.id_end LIKE 'B%' THEN rdb.id_end ELSE p.id_b END,
          p.depth + 1
        FROM paths p
        JOIN rdb ON rdb.id_start = p.current_node
        WHERE p.depth < 4
          AND (
            (p.current_node LIKE 'A%' AND (rdb.id_end LIKE 'E%' OR rdb.id_end LIKE 'S%' OR rdb.id_end LIKE 'R%' OR rdb.id_end LIKE 'B%'))
            OR (p.current_node LIKE 'E%' AND (rdb.id_end LIKE 'S%' OR rdb.id_end LIKE 'R%' OR rdb.id_end LIKE 'B%'))
            OR (p.current_node LIKE 'S%' AND (rdb.id_end LIKE 'R%' OR rdb.id_end LIKE 'B%'))
            OR (p.current_node LIKE 'R%' AND id_end LIKE 'B%')
          )
      )
      SELECT * FROM (
        SELECT
          p.id_aa, p.id_a, p.law_content,
          p.law_content_sched,
          p.id_e, e.content_e AS decree_content,
          e.content_e_sched AS decree_content_sched,
          p.id_s, s.content_s AS regulation_content,
          s.content_s_sched AS regulation_content_sched,
          p.id_r, r.content_r AS rule_content,
          r.content_r_sched AS rule_content_sched,
          p.id_b, b.content_b AS book_content,
          b.content_b_sched AS book_content_sched,
          p.law_sched_date,
          e.sched_date AS decree_sched_date,
          s.sched_date AS regulation_sched_date,
          r.sched_date AS rule_sched_date,
          b.sched_date AS book_sched_date,
          e.seq AS ide,
          s.seq AS ids,
          r.seq AS idr,
          b.seq AS idb,
          p.ida,
          COUNT(*) OVER (PARTITION BY p.id_a) AS a_count
        FROM paths p
        LEFT JOIN db_e e ON e.id_e = p.id_e
        LEFT JOIN db_s s ON s.id_s = p.id_s
        LEFT JOIN db_r r ON r.id_r = p.id_r
        LEFT JOIN db_b b ON b.id_b = p.id_b
        WHERE NOT EXISTS (
          SELECT 1 FROM rdb
          WHERE id_start = p.current_node
            AND (
              (p.current_node LIKE 'A%' AND (id_end LIKE 'E%' OR id_end LIKE 'S%' OR id_end LIKE 'R%' OR id_end LIKE 'B%'))
              OR (p.current_node LIKE 'E%' AND (id_end LIKE 'S%' OR id_end LIKE 'R%' OR id_end LIKE 'B%'))
              OR (p.current_node LIKE 'S%' AND (id_end LIKE 'R%' OR id_end LIKE 'B%'))
              OR (p.current_node LIKE 'R%' AND id_end LIKE 'B%')
            )
        )
      ) t
      WHERE
        NOT (
          t.law_content IS NOT NULL
          AND t.decree_content IS NULL
          AND t.regulation_content IS NULL
          AND t.rule_content IS NULL
          AND t.book_content IS NULL
          AND t.a_count > 1
        )

      UNION ALL

      SELECT
        a.id_aa, NULL, a.content_a,
        NULL,
        NULL, NULL, NULL,
        NULL, NULL, NULL,
        NULL, NULL, NULL,
        NULL, NULL, NULL,
        NULL, NULL, NULL, NULL, NULL,
        NULL, NULL, NULL, NULL,
        a.seq AS ida,
        1 AS a_count
      FROM db_a a
      WHERE a.id_a IS NULL AND a.title_a IS NOT NULL AND a.id_aa IN (${placeholders})

      ORDER BY
        ida,
        ide,
        ids,
        idr,
        idb;
      `;
    }

    const rows = await this.db.query<LawResult>(query, [...lawIds, ...lawIds]); // id정보는 여기 쿼리단에서 조합해서 던짐
    return rows;
  }

  async getLawTitles(dbContext: DbContext): Promise<LawTitle[]> {

    this.setDbContext(dbContext); // DbContext 설정
    const query = `
    SELECT 
        DISTINCT id_aa as id_a,  -- id_a가 아니라 id_aa로 변경, 그러나 alias는 id_a로 변경해야 기존 코드와 호환
        title_a,
        CASE WHEN id_a IS NULL THEN 1 ELSE 0 END as isTitle 
    FROM db_a    
    ORDER BY seq
    `;
    return await this.db.query<LawTitle>(query);
  }

  async getMeta(dbContext: DbContext): Promise<{ origin: string; full_name: string; short_name: string }[]> {
    this.setDbContext(dbContext);
    const query = `SELECT origin, full_name, short_name FROM db_meta ORDER BY _pk`;
    return await this.db.query(query);
  }

  toLawTree(rows: LawResult[]): LawTreeNode[] {
    return TreeConverter.toLawTree(rows);
  }

  // 단일 조문 조회 API용 메서드 추가
  async getArticle(dbContext: DbContext, origin: string, id: string): Promise<{ content: string } | null> {
    this.setDbContext(dbContext);

    const validOrigins = ['a', 'e', 's', 'r', 'b'];
    if (!origin || !validOrigins.includes(origin)) return null;

    const tableName = `db_${origin}`;
    const idField = `id_${origin}`;
    const contentField = `content_${origin}`;

    const query = `
      SELECT ${contentField} as content
      FROM ${tableName}
      WHERE ${idField} = ?
      LIMIT 1
    `;

    const rows = await this.db.query<{ content: string }>(query, [id]);
    if (rows && rows.length > 0) {
      return rows[0];
    }
    return null;
  }
}
