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

/**
 * 기준 전환 피벗 1행(long-format). dir 로 구분:
 *  - 'base': 기준조 자기행(루트 노드 생성용)
 *  - 'up'  : 기준조에 '직접' 매핑되는 상위 조문(역방향 rdb 1홉)
 *  - 'down': 기준조의 하위 조문(정방향 rdb 전이). parent_id 로 트리 중첩.
 */
export interface PivotRow extends RowDataPacket {
  base_seq: number;
  base_id: string;
  base_content: string | null;
  base_sched: string | null;
  base_date: string | null;
  node_id: string;
  node_content: string | null;
  node_sched: string | null;
  node_date: string | null;
  node_seq: number | null;
  parent_id: string | null;
  depth: number;
  dir: 'base' | 'up' | 'down';
}

const PIVOT_LEVELS = ['a', 'e', 's', 'r', 'b'] as const;

export class LawModel extends LawBaseModel {

  /**
   * 기준(base) 전환 피벗 — 기준조가 속한 계층 '체인 전체'를 양방향 전이로 가져온다(원래 5단표를 기준점에서 재루팅).
   *  - 상향(up):  기준조의 상위 조문을 전이로(역방향 rdb 재귀) — 예) 시행세칙→감독규정→시행령→법 까지 타고 올라감.
   *  - 하향(down): 기준조의 하위 조문을 전이로(정방향 rdb 재귀) — 예) 시행령→감독규정→시행세칙 까지 타고 내려감.
   *  - 양쪽 모두 parent_id(트리상 '기준점에 가까운' 노드)를 함께 내려 프론트에서 5단표와 동일하게 중첩 렌더.
   * base/step 은 컨트롤러에서 검증되지만, 여기서도 화이트리스트(PIVOT_LEVELS)로만 SQL 식별자를 구성해 주입을 차단.
   */
  async getPivot(dbContext: DbContext, step: number, base: string): Promise<PivotRow[]> {
    this.setDbContext(dbContext);

    const levels = PIVOT_LEVELS.slice(0, step);
    const bi = levels.indexOf(base as typeof PIVOT_LEVELS[number]);
    if (bi < 0) return []; // base 가 레벨 목록에 없으면(=화이트리스트 통과 실패) 빈 결과

    const U = (lv: string) => lv.toUpperCase();
    const above = levels.slice(0, bi);     // 상위 레벨들
    const below = levels.slice(bi + 1);    // 하위 레벨들

    // 하향 descent 조건: 기준~하위 각 레벨에서 '자기보다 낮은' 레벨로만 내려간다.
    const descend = levels.slice(bi).map((lv, i) => {
      const lowers = levels.slice(bi + i + 1).map(U).join('');
      return lowers ? `(d.node_id LIKE '${U(lv)}%' AND rdb.id_end REGEXP '^[${lowers}]')` : null;
    }).filter(Boolean).join(' OR ');
    // 상향 ascend 조건: 기준~상위 각 레벨에서 '자기보다 높은' 레벨로만 올라간다.
    const ascend = levels.slice(0, bi + 1).map((lv, i) => {
      const highers = levels.slice(0, i).map(U).join('');
      return highers ? `(u.node_id LIKE '${U(lv)}%' AND rdb.id_start REGEXP '^[${highers}]')` : null;
    }).filter(Boolean).join(' OR ');

    // 하위/상위 레벨 테이블 LEFT JOIN + COALESCE 로 node 내용/seq 를 뽑는 헬퍼
    const sideSelect = (cteAlias: string, sideLevels: string[], dir: string) => {
      const joins = sideLevels.map(lv => `LEFT JOIN db_${lv} x_${lv} ON x_${lv}.id_${lv} = ${cteAlias}.node_id`).join('\n        ');
      const coal = (col: string) => `COALESCE(${sideLevels.map(lv => `x_${lv}.${col.replace('{lv}', lv)}`).join(', ')})`;
      return `
        SELECT ${cteAlias}.base_seq, ${cteAlias}.base_id, NULL AS base_content, NULL AS base_sched, NULL AS base_date,
               ${cteAlias}.node_id,
               ${coal('content_{lv}')} AS node_content,
               ${coal('content_{lv}_sched')} AS node_sched,
               ${coal('sched_date')} AS node_date,
               ${coal('seq')} AS node_seq,
               ${cteAlias}.parent_id, ${cteAlias}.depth, '${dir}' AS dir
        FROM ${cteAlias}
        ${joins}
        WHERE ${cteAlias}.depth > 0 AND ${coal('content_{lv}')} IS NOT NULL`;
    };

    const ctes: string[] = [];
    const unionParts: string[] = [];

    if (below.length) {
      ctes.push(`down_ids AS (
        SELECT b.id_${base} AS base_id, b.seq AS base_seq, b.id_${base} AS node_id, CAST(NULL AS CHAR(64)) AS parent_id, 0 AS depth
        FROM db_${base} b WHERE b.id_${base} IS NOT NULL AND b.content_${base} IS NOT NULL
        UNION ALL
        SELECT d.base_id, d.base_seq, rdb.id_end, d.node_id, d.depth + 1
        FROM down_ids d JOIN rdb ON rdb.id_start = d.node_id AND rdb.id_end <> d.node_id
        WHERE d.depth < ${step} AND (${descend})
      )`);
      unionParts.push(sideSelect('down_ids', below, 'down'));
    }

    if (above.length) {
      ctes.push(`up_ids AS (
        SELECT b.id_${base} AS base_id, b.seq AS base_seq, b.id_${base} AS node_id, CAST(NULL AS CHAR(64)) AS parent_id, 0 AS depth
        FROM db_${base} b WHERE b.id_${base} IS NOT NULL AND b.content_${base} IS NOT NULL
        UNION ALL
        SELECT u.base_id, u.base_seq, rdb.id_start, u.node_id, u.depth + 1
        FROM up_ids u JOIN rdb ON rdb.id_end = u.node_id AND rdb.id_start <> u.node_id
        WHERE u.depth < ${step} AND (${ascend})
      )`);
      unionParts.push(sideSelect('up_ids', above, 'up'));
    }

    // 기준조 자기행(루트 생성용). id NOT NULL 로 제목행(장·절) 제외.
    unionParts.push(`
        SELECT b.seq AS base_seq, b.id_${base} AS base_id, b.content_${base} AS base_content,
               b.content_${base}_sched AS base_sched, b.sched_date AS base_date,
               b.id_${base} AS node_id, b.content_${base} AS node_content, b.content_${base}_sched AS node_sched,
               b.sched_date AS node_date, b.seq AS node_seq, NULL AS parent_id, 0 AS depth, 'base' AS dir
        FROM db_${base} b WHERE b.id_${base} IS NOT NULL AND b.content_${base} IS NOT NULL`);

    const cte = ctes.length ? `WITH RECURSIVE ${ctes.join(',\n')}\n` : '';

    // base 먼저(루트) → up/down(각 depth 오름차순으로 부모가 자식보다 먼저 생기게).
    const query = `${cte}${unionParts.join('\nUNION ALL\n')}
      ORDER BY base_seq, FIELD(dir,'base','up','down'), depth, node_seq`;

    return this.db.query<PivotRow>(query);
  }

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

  /**
   * 법령 레지스트리 — 명시적 목록 테이블 `ldb_auth.law_registry`(단일 출처)에서 활성 법령을 읽고,
   * 각 법령의 표시정보(step·names·originMap)는 그 DB의 db_meta 에서 도출한다.
   * 새 법령 = ldb_<code> 적재 + law_registry 에 1행 INSERT. (db/law_registry.sql 참고)
   * law_registry 테이블이 없으면 [] 반환 → 프론트가 하드코딩 드롭다운으로 폴백.
   */
  async getLawRegistry(): Promise<Array<{ code: string; label: string; step: number; names: string[]; originMap: Record<string, string>; kind: string }>> {
    const LEVELS = ['a', 'e', 's', 'r', 'b'];
    const authDb = process.env.AUTH_DB || 'ldb_auth';

    let regs: Array<{ code: string; label: string | null; kind: string }>;
    try {
      const auth = DbContext.getInstance(authDb);
      regs = await auth.query(
        `SELECT code, label, kind FROM law_registry WHERE enabled = 1 ORDER BY sort_order, code`,
      );
    } catch {
      return []; // law_registry 미설치 → 폴백
    }

    const out: Array<{ code: string; label: string; step: number; names: string[]; originMap: Record<string, string>; kind: string }> = [];
    for (const reg of regs) {
      try {
        const ctx = DbContext.getInstance(`ldb_${reg.code}`);
        const meta = await ctx.query<{ origin: string; full_name: string; short_name: string }>(
          `SELECT origin, full_name, short_name FROM db_meta ORDER BY _pk`,
        );
        const levels = meta.filter(m => LEVELS.includes(m.origin)); // 트리 레벨 행만(잡행 방어)
        if (!levels.length) continue;
        const originMap: Record<string, string> = {};
        meta.forEach(m => { originMap[m.origin] = m.short_name; });
        out.push({
          code: reg.code,
          // 라벨: registry override 우선, 없으면 법(a) full_name 첫 줄(=법령명).
          label: reg.label || (levels[0].full_name || '').split('\n')[0] || levels[0].short_name,
          step: levels.length,
          names: levels.map(m => m.full_name),
          originMap,
          kind: reg.kind,
        });
      } catch {
        // ldb_<code> 미존재/비정상 → 목록에서 제외(등록만 됐고 아직 적재 전 등)
      }
    }
    return out;
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

  /**
   * 위임 체인 — 한 조(주로 벌칙 위반조)가 rdb로 위임한 하위 조문(시행령→감독규정→세칙)을
   * 깊이순으로 반환. 벌칙 원문 팝업에서 "진짜 원인규정"(대통령령 위임 등)을 함께 보여주려는 용도.
   * 시작 조 자신(depth 0)은 제외하고 하위만 반환.
   */
  async getDelegationChain(dbContext: DbContext, id: string):
      Promise<{ chain: Array<{ origin: string; id: string; content: string }>; highlights: Array<{ up: string; down: string }> }> {
    this.setDbContext(dbContext);
    const query = `
      WITH RECURSIVE chain AS (
        SELECT CAST(? AS CHAR(64)) AS node_id, 0 AS depth
        UNION ALL
        SELECT rdb.id_end, c.depth + 1
        FROM chain c
        JOIN rdb ON rdb.id_start = c.node_id AND rdb.id_end <> c.node_id
        WHERE c.depth < 4 AND rdb.id_end REGEXP '^[ESR]'
      )
      SELECT DISTINCT c.node_id AS id, LOWER(LEFT(c.node_id, 1)) AS origin, c.depth AS depth,
             COALESCE(e.content_e, s.content_s, r.content_r) AS content
      FROM chain c
      LEFT JOIN db_e e ON e.id_e = c.node_id
      LEFT JOIN db_s s ON s.id_s = c.node_id
      LEFT JOIN db_r r ON r.id_r = c.node_id
      WHERE c.depth > 0
      ORDER BY c.depth, c.node_id`;
    const rows = await this.db.query<{ id: string; origin: string; content: string | null }>(query, [id]);
    const chain = rows.filter(r => r.content).map(r => ({ origin: r.origin, id: r.id, content: r.content as string }));
    // 강조쌍(정밀 항/호) — 프론트가 위반 호에서 따라가며 해당 부분만 강조
    return { chain, highlights: await this.getHighlights(dbContext) };
  }

  /** 전체 인용 강조쌍(db_rdb_hl) — 5단표/팝업에서 '실제 참조된 항/호'만 강조. */
  async getHighlights(dbContext: DbContext): Promise<Array<{ up: string; down: string }>> {
    this.setDbContext(dbContext);
    try {
      return await this.db.query<{ up: string; down: string }>(
        'SELECT up_id AS up, down_id AS `down` FROM db_rdb_hl');
    } catch {
      return []; // 테이블 미존재(구버전 DB) → 강조 없음
    }
  }
}
