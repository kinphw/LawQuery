import db from './db'; // pool → db로 변경

import type { RowDataPacket } from 'mysql2'; // ✅ 완전 OK
import type { LawResult } from '../types/LawResult';
// import { LawTitle } from '../types/LawTitle';
import { LawTitle } from '../types/LawTitle';

export class LawModel {
  async getAllLaws(): Promise<LawResult[]> {
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

}
