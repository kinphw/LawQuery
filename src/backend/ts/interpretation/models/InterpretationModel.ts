import DbContext from '../../common/DbContext'; // 기존 db 인스턴스 재활용
import type { SearchResult } from '../types/SearchResult';
import type { DetailResult } from '../types/DetailResult';

export class InterpretationModel {

  private db: DbContext;
  constructor() {
    this.db = DbContext.getInstance('ldb_i'); // 'db_i'는 해석 데이터베이스의 이름
  }
  async search(criteria: { 
    type: string; 
    serial: string; 
    field: string; 
    keyword: string;
  }): Promise<SearchResult[]> {
    let query = `
      SELECT 
        id, 구분, 분야, 제목, 일련번호, 회신일자
      FROM db_i 
      WHERE 1=1
    `;
    
    const conditions: string[] = [];
    const params: any[] = [];

    if (criteria.type !== "전체") {
      conditions.push(`구분 = ?`);
      params.push(criteria.type);
    }

    if (criteria.serial) {
      conditions.push(`일련번호 LIKE ?`);
      params.push(`%${criteria.serial}%`);
    }

    if (criteria.keyword) {
      const keywords = criteria.keyword.split(/\s+/).filter(k => k);
      
      if (criteria.field === "전체") {
        const keywordConditions = keywords.map(() => 
          `(제목 LIKE ? OR 질의요지 LIKE ? OR 회답 LIKE ? OR 이유 LIKE ?)`
        );
        conditions.push(`(${keywordConditions.join(' AND ')})`);
        
        keywords.forEach(keyword => {
          params.push(`%${keyword}%`);
          params.push(`%${keyword}%`);
          params.push(`%${keyword}%`);
          params.push(`%${keyword}%`);
        });
      } else {
        const keywordConditions = keywords.map(() => `${criteria.field} LIKE ?`);
        conditions.push(`(${keywordConditions.join(' AND ')})`);
        
        keywords.forEach(keyword => {
          params.push(`%${keyword}%`);
        });
      }
    }

    if (conditions.length > 0) {
      query += " AND " + conditions.join(" AND ");
    }

    query += ` 
      ORDER BY 
        CASE WHEN 회신일자 IS NULL THEN 1 ELSE 0 END,
        회신일자 DESC,
        id DESC
    `;

    const results = await this.db.query<SearchResult>(query, params);
    return results;
  }

  async getDetail(id: number): Promise<DetailResult | null> {
    const query = `
      SELECT 
        id, 질의요지, 회답, 이유
      FROM db_i 
      WHERE id = ?
    `;
    
    const results = await this.db.query<DetailResult>(query, [id]);
    return results.length > 0 ? results[0] : null;
  }

  async getInitialData(): Promise<SearchResult[]> {
    return this.search({
      type: "전체",
      serial: "",
      field: "전체",
      keyword: ""
    });
  }
}