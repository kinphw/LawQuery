// import { Database } from './Database';
// import { SearchCriteria, SearchResult } from '../types/types';

/// <reference path="./Database.ts" />

class SearchModel {
  constructor(private db: Database) {}

  // 실제 검색을 수행하는 메서드
  // 사용자정의 검색조건을 받아서 다시 사용자정의 검색결과를 반환
  search(criteria: SearchCriteria): SearchResult[] { // 사용자정의형식인 SearchResult배열 반환

    // console.log("Searching with criteria:", criteria); // 디버깅용
    
    // 쿼리생성부
    let query = `
    SELECT * FROM db_i WHERE 1=1
    `;
    const conditions: string[] = [];

    // 매개변수로 받은 criteria 객체의 속성에 따라 검색 조건을 추가
    if (criteria.type !== "전체") {
      conditions.push(`구분 = '${criteria.type}'`);
    }

    if (criteria.serial) {
      conditions.push(`일련번호 LIKE '%${criteria.serial}%'`);
    }

    if (criteria.keyword) {
      if (criteria.field === "전체") {
        conditions.push(`(제목 LIKE '%${criteria.keyword}%' OR 
                        질의요지 LIKE '%${criteria.keyword}%' OR 
                        회답 LIKE '%${criteria.keyword}%' OR 
                        이유 LIKE '%${criteria.keyword}%')`);
      } else {
        conditions.push(`${criteria.field} LIKE '%${criteria.keyword}%'`);
      }
    }

    // criteria에 부여된 조건이 있으면 WHERE문 아래에 AND로 추가
    if (conditions.length > 0) {
      query += " AND " + conditions.join(" AND ");
    }

    // 쿼리 실행부
    const results = this.db.executeQuery(query);
    // console.log("Search results:", results); // 디버깅용
    return results;
  }

  getInitialData(): SearchResult[] {
    return this.search({
        type: "전체",
        serial: "",
        field: "전체",
        keyword: ""
    });
}

}
window.SearchModel = SearchModel;