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
    startDate?: string;
    endDate?: string;    
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

      // ⚠️ 보안: 컬럼 식별자는 파라미터라이즈(?)가 불가능하므로 반드시 화이트리스트로 고정한다.
      // (예전엔 criteria.field 를 raw 로 SQL에 보간 → 미인증 SQL 인젝션. field 가 목록에 없으면
      //  '전체'(모든 컬럼 OR 검색)로 안전하게 폴백.)
      const SEARCH_FIELDS = ['제목', '질의요지', '회답', '이유'];
      const searchAll = criteria.field === '전체' || !SEARCH_FIELDS.includes(criteria.field);

      if (searchAll) {
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
        // criteria.field 는 위 화이트리스트를 통과한 값만 도달 → 보간 안전.
        const col = criteria.field;
        const keywordConditions = keywords.map(() => `${col} LIKE ?`);
        conditions.push(`(${keywordConditions.join(' AND ')})`);

        keywords.forEach(keyword => {
          params.push(`%${keyword}%`);
        });
      }
    }

    if (criteria.startDate) {
        conditions.push(`회신일자 >= ?`);
        params.push(criteria.startDate);
    }

    if (criteria.endDate) {
        conditions.push(`회신일자 <= ?`);
        params.push(criteria.endDate);
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

  /** 여러 id의 본문을 한 번에. 비회원 티저(보이는 행들)의 본문 인라인 전달용. */
  async getDetailsByIds(ids: number[]): Promise<DetailResult[]> {
    if (!ids.length) return [];
    const placeholders = ids.map(() => '?').join(',');
    const query = `
      SELECT
        id, 질의요지, 회답, 이유
      FROM db_i
      WHERE id IN (${placeholders})
    `;
    return this.db.query<DetailResult>(query, ids);
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