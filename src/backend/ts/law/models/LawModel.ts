import db from './db'; // pool → db로 변경

import type { RowDataPacket } from 'mysql2'; // ✅ 완전 OK
import type { LawResult } from '../types/LawResult';
// import { LawTitle } from '../types/LawTitle';
import { LawTitle } from '../types/LawTitle';
import { LawTreeNode } from '../types/LawTreeNode';

export class LawModel {
  async getAllLawsOld(): Promise<LawResult[]> {
    const query = `

          SELECT
          a.id_a, 
          a.content_a AS law_content,
        
          -- 시행령
          (
            SELECT GROUP_CONCAT(DISTINCT e.content_e ORDER BY e.id SEPARATOR '|*|')
            FROM db_e e
            JOIN rdb_ae ae ON ae.id_e = e.id_e
            WHERE ae.id_a = a.id_a
          ) AS decree_content,
        
          -- 감독규정
          (
            SELECT GROUP_CONCAT(DISTINCT s.content_s ORDER BY s.id SEPARATOR '|*|')
            FROM db_s s
            JOIN rdb_es es ON es.id_s = s.id_s
            JOIN rdb_ae ae ON ae.id_e = es.id_e
            WHERE ae.id_a = a.id_a
          ) AS regulation_content,
        
          -- 시행세칙
          (
            SELECT GROUP_CONCAT(DISTINCT r.content_r ORDER BY r.id SEPARATOR '|*|')
            FROM db_r r
            JOIN rdb_sr sr ON sr.id_r = r.id_r
            JOIN rdb_es es ON es.id_s = sr.id_s
            JOIN rdb_ae ae ON ae.id_e = es.id_e
            WHERE ae.id_a = a.id_a
          ) AS rule_content
        
        FROM db_a a
        ORDER BY a.id;
  
    `;
    const rows = await db.query<LawResult>(query);
    return rows;
  }

  async getAllLaws(): Promise<LawResult[]> {
    const query = `

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
        e.content_e AS decree_content,
        es.id_s,
        s.id AS ids,
        s.content_s AS regulation_content,
        sr.id_r,
        r.id AS idr,
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
        NULL AS decree_content,
        NULL AS id_s,
        NULL AS ids,
        NULL AS regulation_content,
        NULL AS id_r,
        NULL AS idr,
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
    ORDER BY t.ida, t.ide, t.ids, t.idr;
  
    `;
    const rows = await db.query<LawResult>(query);
    return rows;
  }


  async getLawByIds(lawIds: string[]): Promise<LawResult[]> {
    if (!lawIds.length) return [];

    const placeholders = new Array(lawIds.length).fill('?').join(',');    
    const query = `
          SELECT
          a.id_a, 
          a.content_a AS law_content,
        
          -- 시행령
          (
            SELECT GROUP_CONCAT(DISTINCT e.content_e ORDER BY e.id SEPARATOR '|*|')
            FROM db_e e
            JOIN rdb_ae ae ON ae.id_e = e.id_e
            WHERE ae.id_a = a.id_a
          ) AS decree_content,
        
          -- 감독규정
          (
            SELECT GROUP_CONCAT(DISTINCT s.content_s ORDER BY s.id SEPARATOR '|*|')
            FROM db_s s
            JOIN rdb_es es ON es.id_s = s.id_s
            JOIN rdb_ae ae ON ae.id_e = es.id_e
            WHERE ae.id_a = a.id_a
          ) AS regulation_content,
        
          -- 시행세칙
          (
            SELECT GROUP_CONCAT(DISTINCT r.content_r ORDER BY r.id SEPARATOR '|*|')
            FROM db_r r
            JOIN rdb_sr sr ON sr.id_r = r.id_r
            JOIN rdb_es es ON es.id_s = sr.id_s
            JOIN rdb_ae ae ON ae.id_e = es.id_e
            WHERE ae.id_a = a.id_a
          ) AS rule_content
        
        FROM db_a a
        WHERE a.id_aa IN (${placeholders}) -- 검색자를 id_aa로 변경
        ORDER BY a.id;
    `;
    const rows = await db.query<LawResult>(query, [...lawIds]); // id정보는 여기 쿼리단에서 조합해서 던짐
    return rows;
  }

  async getLawTitles(): Promise<LawTitle[]> {
    const query = `
    SELECT 
        id_aa as id_a,  -- id_a가 아니라 id_aa로 변경, 그러나 alias는 id_a로 변경해야 기존 코드와 호환
        title_a,
        CASE WHEN id_a IS NULL THEN 1 ELSE 0 END as isTitle 
    FROM db_a
    
    WHERE title_a IS NOT NULL -- title_a가 NULL이 아닌 것만 가져옴
    
    ORDER BY id
    `;
    return await db.query<LawTitle>(query);
  }

  // JSON으로 변환 : 250430
  // toLawTree(rows: LawResult[]) : LawTreeNode[]{
  //   const lawMap = new Map<string, any>();

  //   rows.forEach(row => {
  //     // 1. 조문(법)
  //     if (!lawMap.has(row.id_a)) {
  //       lawMap.set(row.id_a, {
  //         id: row.id_a,
  //         id_aa: row.id_aa,
  //         title: row.law_content,
  //         children: []
  //       });
  //     }
  //     const law = lawMap.get(row.id_a);

  //     // 2. 시행령
  //     let decree = row.id_e && law.children.find((d: any) => d.id === row.id_e);
  //     if (!decree && row.id_e) {
  //       decree = {
  //         id: row.id_e,
  //         title: row.decree_content,
  //         children: []
  //       };
  //       law.children.push(decree);
  //     }

  //     // 3. 감독규정
  //     let regulation = decree && row.id_s && decree.children.find((s: any) => s.id === row.id_s);
  //     if (!regulation && decree && row.id_s) {
  //       regulation = {
  //         id: row.id_s,
  //         title: row.regulation_content,
  //         children: []
  //       };
  //       decree.children.push(regulation);
  //     }

  //     // 4. 시행세칙
  //     if (regulation && row.id_r) {
  //       if (!regulation.children.find((r: any) => r.id === row.id_r)) {
  //         regulation.children.push({
  //           id: row.id_r,
  //           title: row.rule_content
  //         });
  //       }
  //     }
  //   });

  //   return Array.from(lawMap.values());
  // }  

  toLawTree(rows: LawResult[]): LawTreeNode[] {
    const lawMap = new Map<string, any>();
    const result: LawTreeNode[] = [];
  
    rows.forEach(row => {
      // 타이틀(장, 절 등)
      if (!row.id_a) {
        result.push({
          id: null,
          id_aa: row.id_aa,
          title: row.law_content,
          isTitle: true,
          children: []
        });
        return;
      }
  
      // 본문(트리)
      if (!lawMap.has(row.id_a)) {
        const node = {
          id: row.id_a,
          id_aa: row.id_aa,
          title: row.law_content,
          children: []
        };
        lawMap.set(row.id_a, node);
        result.push(node);
      }
      const law = lawMap.get(row.id_a);
  
      // 이하 기존 트리 변환 로직 (decree, regulation, rule ...)
      let decree = row.id_e && law.children.find((d: any) => d.id === row.id_e);
      if (!decree && row.id_e) {
        decree = {
          id: row.id_e,
          title: row.decree_content,
          children: []
        };
        law.children.push(decree);
      }
  
      let regulation = decree && row.id_s && decree.children.find((s: any) => s.id === row.id_s);
      if (!regulation && decree && row.id_s) {
        regulation = {
          id: row.id_s,
          title: row.regulation_content,
          children: []
        };
        decree.children.push(regulation);
      }
  
      if (regulation && row.id_r) {
        if (!regulation.children.find((r: any) => r.id === row.id_r)) {
          regulation.children.push({
            id: row.id_r,
            title: row.rule_content
          });
        }
      }
    });
  
    return result;
  }  

}
