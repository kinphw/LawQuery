// import { SearchDatabase } from './SearchDatabase';
import { SearchCriteria } from '../types/SearchCriteria';
import { SearchResult } from '../types/SearchResult';

export class SearchModel {
  // constructor(private db: SearchDatabase) {}

  private lastSearchCount: number = 0;  

  // 실제 검색을 수행하는 메서드
  // 사용자정의 검색조건을 받아서 다시 사용자정의 검색결과를 반환
  // search(criteria: SearchCriteria): SearchResult[] { // 사용자정의형식인 SearchResult배열 반환

  //   // console.log("Searching with criteria:", criteria); // 디버깅용
    
  //   // 쿼리생성부
  //   let query = `
  //   SELECT * FROM db_i WHERE 1=1
  //   `;
  //   const conditions: string[] = [];

  //   // 매개변수로 받은 criteria 객체의 속성에 따라 검색 조건을 추가
  //   if (criteria.type !== "전체") {
  //     conditions.push(`구분 = '${criteria.type}'`);
  //   }

  //   if (criteria.serial) {
  //     conditions.push(`일련번호 LIKE '%${criteria.serial}%'`);
  //   }

  //   // After (수정될 코드)
  //   if (criteria.keyword) {
  //     const keywords = criteria.keyword.split(/\s+/).filter(k => k);
      
  //     if (criteria.field === "전체") {
  //       const keywordConditions = keywords.map(keyword => 
  //         `(제목 LIKE '%${keyword}%' OR 
  //           질의요지 LIKE '%${keyword}%' OR 
  //           회답 LIKE '%${keyword}%' OR 
  //           이유 LIKE '%${keyword}%')`
  //       );
  //       conditions.push(`(${keywordConditions.join(' AND ')})`);
  //     } else {
  //       const keywordConditions = keywords.map(keyword => 
  //         `${criteria.field} LIKE '%${keyword}%'`
  //       );
  //       conditions.push(`(${keywordConditions.join(' AND ')})`);
  //     }
  //   }

  //   // criteria에 부여된 조건이 있으면 WHERE문 아래에 AND로 추가
  //   if (conditions.length > 0) {
  //     query += " AND " + conditions.join(" AND ");
  //   }


  //   // Always append ORDER BY at the end
  //   // query += ` ORDER BY 일련번호 DESC`;
  //   // query += ` ORDER BY id DESC`;

  //   query += ` ORDER BY 
  //             CASE WHEN 회신일자 IS NULL THEN 1 ELSE 0 END,  -- NULL을 마지막으로
  //             회신일자 DESC,                                  -- 회신일자 내림차순
  //             id DESC`;  

  //   // 쿼리 실행부
  //   const results = this.db.executeQuery(query);
  //   // console.log("Search results:", results); // 디버깅용
  //   return results;
  // }

  // 실제 검색을 수행하는 메서드
  async search(criteria: SearchCriteria): Promise<SearchResult[]> {
    try {
      // API 요청 URL 구성
      const url = new URL('/api/interpretation/search', window.location.origin);
      url.searchParams.append('type', criteria.type);
      url.searchParams.append('serial', criteria.serial || '');
      url.searchParams.append('field', criteria.field);
      url.searchParams.append('keyword', criteria.keyword || '');
      if (criteria.startDate) url.searchParams.append('startDate', criteria.startDate);
      if (criteria.endDate) url.searchParams.append('endDate', criteria.endDate);
      
      // API 호출
      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error('검색 중 오류가 발생했습니다.');
      }
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || '검색 중 오류가 발생했습니다.');
      }
      
      // 검색 결과 건수를 저장
      this.lastSearchCount = result.count || 0;
      
      return result.data || [];
    } catch (error) {
      console.error('Search API error:', error);
      return [];
    }
  }  

  // 상세 정보를 가져오는 메서드 추가
  async getDetail(id: number): Promise<{ 질의요지: string; 회답: string; 이유: string; } | null> {
    try {
      const response = await fetch(`/api/interpretation/detail/${id}`); // Backend에서는 :id로 id를 가져옴
      if (!response.ok) {
        throw new Error('상세정보를 가져오는 중 오류가 발생했습니다.');
      }
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || '상세정보를 가져오는 중 오류가 발생했습니다.');
      }
      
      return result.data || null;
    } catch (error) {
      console.error('Get detail API error:', error);
      return null;
    }
  }  

  // getInitialData(): SearchResult[] {
  //   return this.search({
  //       type: "전체",
  //       serial: "",
  //       field: "전체",
  //       keyword: ""
  //   });
  // }

  // 초기 데이터를 가져오는 메서드
  async getInitialData(): Promise<SearchResult[]> {
    try {
      const response = await fetch('/api/interpretation/initial');
      if (!response.ok) {
        throw new Error('초기 데이터를 가져오는 중 오류가 발생했습니다.');
      }
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || '초기 데이터를 가져오는 중 오류가 발생했습니다.');
      }
      
      // 검색 결과 건수를 저장
      this.lastSearchCount = result.count || 0;
      
      return result.data || [];
    } catch (error) {
      console.error('Initial data API error:', error);
      return [];
    }
  }
  
  // 마지막 검색 결과 건수를 가져오는 메서드
  getLastSearchCount(): number {
    return this.lastSearchCount;
  }  

}
