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

    let query:string = '';

    if (step === 4) {
      query = `

      SELECT
        t.id_aa,
        t.id_a,
        t.law_content,
        t.id_e,
        t.decree_content,
        t.id_s,
        t.regulation_content,
        t.id_r,
        t.rule_content
      FROM (
        SELECT
          a.id_aa AS id_aa,
          a.id AS ida,
          a.id_a,
          a.content_a AS law_content,
          ae.id_e,
          e.id AS ide,
          ae.id AS id_ae, -- 추가
          e.content_e AS decree_content,
          es.id_s,
          s.id AS ids,
          es.id AS id_es, -- 추가
          s.content_s AS regulation_content,
          sr.id_r,
          r.id AS idr,
          sr.id AS id_sr, -- 추가
          r.content_r AS rule_content,
          COUNT(*) OVER (PARTITION BY a.id_a) AS a_count
        FROM db_a a
        LEFT JOIN rdb_ae ae ON ae.id_a = a.id_a
        LEFT JOIN rdb_es es ON es.id_e = ae.id_e
        LEFT JOIN rdb_sr sr ON sr.id_s = es.id_s
        LEFT JOIN db_e e ON e.id_e = ae.id_e
        LEFT JOIN db_s s ON s.id_s = es.id_s
        LEFT JOIN db_r r ON r.id_r = sr.id_r

        UNION ALL

        SELECT
          a.id_aa AS id_aa,
          a.id AS ida,
          NULL AS id_a,
          a.content_a AS law_content,
          NULL AS id_e,
          NULL AS ide,
          NULL AS id_ae, -- 추가
          NULL AS decree_content,
          NULL AS id_s,
          NULL AS ids,
          NULL AS id_es, -- 추가
          NULL AS regulation_content,
          NULL AS id_r,
          NULL AS idr,
          NULL AS id_sr, -- 추가
          NULL AS rule_content,
          1 AS a_count
        FROM db_a a
        WHERE a.id_a IS NULL AND a.title_a IS NOT NULL
      ) t
      WHERE
        NOT (
          t.law_content IS NOT NULL
          AND t.decree_content IS NULL
          AND t.regulation_content IS NULL
          AND t.rule_content IS NULL
          AND t.a_count > 1
        )
      -- ORDER BY t.ida, t.ide, t.ids, t.idr;
      ORDER BY
        t.ida,
        t.id_ae,
        t.id_es,
        t.id_sr;  
      `;
    };

    if (step === 5) {
      query = `
        SELECT
          t.id_aa,
          t.id_a,
          t.law_content,
          t.id_e,
          t.decree_content,
          t.id_s,
          t.regulation_content,
          t.id_r,
          t.rule_content,
          t.id_b,                -- 📌 추가
          t.book_content         -- 📌 추가
        FROM (
          SELECT
            a.id_aa AS id_aa,
            a.id AS ida,
            a.id_a,
            a.content_a AS law_content,

            ae.id_e,
            e.id AS ide,
            ae.id AS id_ae,

            e.content_e AS decree_content,

            es.id_s,
            s.id AS ids,
            es.id AS id_es,

            s.content_s AS regulation_content,

            sr.id_r,
            r.id AS idr,
            sr.id AS id_sr,

            r.content_r AS rule_content,

            rb.id_b,             -- 📌 추가
            b.id AS idb,         -- 📌 추가
            rb.id AS id_rb,      -- 📌 추가

            b.content_b AS book_content,  -- 📌 추가

            COUNT(*) OVER (PARTITION BY a.id_a) AS a_count

          FROM db_a a
          LEFT JOIN rdb_ae ae ON ae.id_a = a.id_a
          LEFT JOIN db_e e ON e.id_e = ae.id_e

          LEFT JOIN rdb_es es ON es.id_e = ae.id_e
          LEFT JOIN db_s s ON s.id_s = es.id_s

          LEFT JOIN rdb_sr sr ON sr.id_s = es.id_s
          LEFT JOIN db_r r ON r.id_r = sr.id_r

          LEFT JOIN rdb_rb rb ON rb.id_r = sr.id_r    -- 📌 추가된 연결 테이블
          LEFT JOIN db_b b ON b.id_b = rb.id_b        -- 📌 추가된 최종 단계 테이블

          UNION ALL

          SELECT
            a.id_aa AS id_aa,
            a.id AS ida,
            NULL AS id_a,
            a.content_a AS law_content,

            NULL AS id_e,
            NULL AS ide,
            NULL AS id_ae,

            NULL AS decree_content,

            NULL AS id_s,
            NULL AS ids,
            NULL AS id_es,

            NULL AS regulation_content,

            NULL AS id_r,
            NULL AS idr,
            NULL AS id_sr,

            NULL AS rule_content,

            NULL AS id_b,           -- 📌 추가
            NULL AS idb,            -- 📌 추가
            NULL AS id_rb,          -- 📌 추가

            NULL AS book_content,   -- 📌 추가

            1 AS a_count
          FROM db_a a
          WHERE a.id_a IS NULL AND a.title_a IS NOT NULL
        ) t
        WHERE
          NOT (
            t.law_content IS NOT NULL
            AND t.decree_content IS NULL
            AND t.regulation_content IS NULL
            AND t.rule_content IS NULL
            AND t.book_content IS NULL      -- 📌 추가된 WHERE 조건
            AND t.a_count > 1
          )
        ORDER BY
          t.ida,
          t.id_ae,
          t.id_es,
          t.id_sr,
          t.id_rb;                 -- 📌 정렬 기준 추가
      `
    }
    const rows = await this.db.query<LawResult>(query);
    return rows;
  }


  async getLawByIds(dbContext: DbContext, step:number, lawIds: string[]): Promise<LawResult[]> {

    this.setDbContext(dbContext); // DbContext 설정    
    if (!lawIds.length) return [];

    const placeholders = new Array(lawIds.length).fill('?').join(',');    

    let query = '';
    if (step ===4) {
      // Debug : 250702
      query =  `

      SELECT
        t.id_aa,
        t.id_a,
        t.law_content,
        t.id_e,
        t.decree_content,
        t.id_s,
        t.regulation_content,
        t.id_r,
        t.rule_content
      FROM (
        SELECT
          a.id_aa AS id_aa,
          a.id AS ida,
          a.id_a,
          a.content_a AS law_content,
          ae.id_e,
          e.id AS ide,
          ae.id AS id_ae, -- 추가
          e.content_e AS decree_content,
          es.id_s,
          s.id AS ids,
          es.id AS id_es, -- 추가
          s.content_s AS regulation_content,
          sr.id_r,
          r.id AS idr,
          sr.id AS id_sr, -- 추가
          r.content_r AS rule_content,
          COUNT(*) OVER (PARTITION BY a.id_a) AS a_count
        FROM db_a a
        LEFT JOIN rdb_ae ae ON ae.id_a = a.id_a
        LEFT JOIN rdb_es es ON es.id_e = ae.id_e
        LEFT JOIN rdb_sr sr ON sr.id_s = es.id_s
        LEFT JOIN db_e e ON e.id_e = ae.id_e
        LEFT JOIN db_s s ON s.id_s = es.id_s
        LEFT JOIN db_r r ON r.id_r = sr.id_r

        UNION ALL

        SELECT
          a.id_aa AS id_aa,
          a.id AS ida,
          NULL AS id_a,
          a.content_a AS law_content,
          NULL AS id_e,
          NULL AS ide,
          NULL AS id_ae, -- 추가
          NULL AS decree_content,
          NULL AS id_s,
          NULL AS ids,
          NULL AS id_es, -- 추가
          NULL AS regulation_content,
          NULL AS id_r,
          NULL AS idr,
          NULL AS id_sr, -- 추가
          NULL AS rule_content,
          1 AS a_count
        FROM db_a a
        WHERE a.id_a IS NULL AND a.title_a IS NOT NULL
      ) t
      WHERE
        NOT (
          t.law_content IS NOT NULL
          AND t.decree_content IS NULL
          AND t.regulation_content IS NULL
          AND t.rule_content IS NULL
          AND t.a_count > 1
        )
      AND t.id_aa IN (${placeholders}) -- 검색자를 id_aa로 변경
      -- ORDER BY t.ida, t.ide, t.ids, t.idr;  
      ORDER BY 
        t.ida,
        t.id_ae,
        t.id_es,
        t.id_sr;  
      `;
    } else if (step === 5) {
      query = `

      SELECT
        t.id_aa,
        t.id_a,
        t.law_content,
        t.id_e,
        t.decree_content,
        t.id_s,
        t.regulation_content,
        t.id_r,
        t.rule_content,
        t.id_b,            -- 📌 추가
        t.book_content     -- 📌 추가
      FROM (
        SELECT
          a.id_aa AS id_aa,
          a.id AS ida,
          a.id_a,
          a.content_a AS law_content,

          ae.id_e,
          e.id AS ide,
          ae.id AS id_ae, -- 추가

          e.content_e AS decree_content,

          es.id_s,
          s.id AS ids,
          es.id AS id_es, -- 추가

          s.content_s AS regulation_content,

          sr.id_r,
          r.id AS idr,
          sr.id AS id_sr, -- 추가

          r.content_r AS rule_content,

          rb.id_b,             -- 📌 추가
          b.id AS idb,         -- 📌 추가
          rb.id AS id_rb,      -- 📌 추가

          b.content_b AS book_content,  -- 📌 추가

          COUNT(*) OVER (PARTITION BY a.id_a) AS a_count

        FROM db_a a
        LEFT JOIN rdb_ae ae ON ae.id_a = a.id_a
        LEFT JOIN db_e e ON e.id_e = ae.id_e

        LEFT JOIN rdb_es es ON es.id_e = ae.id_e
        LEFT JOIN db_s s ON s.id_s = es.id_s

        LEFT JOIN rdb_sr sr ON sr.id_s = es.id_s
        LEFT JOIN db_r r ON r.id_r = sr.id_r

        LEFT JOIN rdb_rb rb ON rb.id_r = sr.id_r    -- 📌 추가: 5단계 릴레이션 테이블
        LEFT JOIN db_b b ON b.id_b = rb.id_b        -- 📌 추가: 5단계 실제 데이터 테이블

        UNION ALL

        SELECT
          a.id_aa AS id_aa,
          a.id AS ida,
          NULL AS id_a,
          a.content_a AS law_content,

          NULL AS id_e,
          NULL AS ide,
          NULL AS id_ae, -- 추가

          NULL AS decree_content,

          NULL AS id_s,
          NULL AS ids,
          NULL AS id_es, -- 추가

          NULL AS regulation_content,

          NULL AS id_r,
          NULL AS idr,
          NULL AS id_sr, -- 추가

          NULL AS rule_content,

          NULL AS id_b,            -- 📌 추가
          NULL AS idb,             -- 📌 추가
          NULL AS id_rb,           -- 📌 추가

          NULL AS book_content,    -- 📌 추가

          1 AS a_count
        FROM db_a a
        WHERE a.id_a IS NULL AND a.title_a IS NOT NULL
      ) t
      WHERE
        NOT (
          t.law_content IS NOT NULL
          AND t.decree_content IS NULL
          AND t.regulation_content IS NULL
          AND t.rule_content IS NULL
          AND t.book_content IS NULL    -- 📌 추가: 필터링 조건에 b단계 추가
          AND t.a_count > 1
        )
      AND t.id_aa IN (${placeholders}) -- 검색자 조건 (유지)
      ORDER BY 
        t.ida,
        t.id_ae,
        t.id_es,
        t.id_sr,
        t.id_rb;      -- 📌 추가: 정렬 기준에 5단계 릴레이션 id 추가

      `
    };

    const rows = await this.db.query<LawResult>(query, [...lawIds]); // id정보는 여기 쿼리단에서 조합해서 던짐
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
    ORDER BY id
    `;
    return await this.db.query<LawTitle>(query);
  }

  toLawTree(rows: LawResult[]): LawTreeNode[] {
    return TreeConverter.toLawTree(rows);
  }


}
