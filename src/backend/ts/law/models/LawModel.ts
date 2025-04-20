import db from './db'; // pool → db로 변경

import type { RowDataPacket } from 'mysql2'; // ✅ 완전 OK
import type { LawResult } from '../types/LawResult';

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

  async getLawById(id: string) {
    const query = `
      SELECT id_a, content_a AS law_content
      FROM db_a
      WHERE id_a = ?
    `;
    const rows = await db.query<LawResult>(query, [id]);
    return rows[0] || null;
  }
}
