import { LawBaseModel } from './LawBaseModel';
import { LawPenalty } from '../types/LawPenalty';
import DbContext from '../../common/DbContext';

export class LawPenaltyModel extends LawBaseModel {

    async getPenalty(dbContext: DbContext, id_a?: string[], sortByPenalty:boolean = true): Promise<LawPenalty[]> {

        this.setDbContext(dbContext); // DbContext 설정

        // 250506 : 법령제목 추가
        // 250506 : id_a가 비어 있으면 전체, 아니면 해당 id만
        // 250506 : sortByPenalty가 true면 벌칙순, false면 원인순 정렬
        const baseQuery = `
          select 
          -- pa.id,
          pa.category,
          -- pa.item_a_phy,
          pa.item_a_log,
          pa.content_pa,
          pe.content_pe,
    
          pa.id_a,      
          a.title_a, -- 250506 : 법령제목 추가 => 렌더링할 목적
          a.content_a,
    
          -- pa.penalty_a_phy,
    
          p.penalty_a_log,
          pe.penalty_e_log
    
          -- pe.id,
    
          from db_penalty_a pa
    
          left outer join db_penalty p 
          on pa.penalty_a_phy = p.penalty_a_phy -- penalty_a_phy를 key로 => p에서 penalty_law_log 가져옴
    
          left outer join db_penalty_e pe
          on pa.item_a_phy = pe.item_a_phy -- item_law_phy를 key로 => pe에서 content_e, penalty_e_log
    
          left outer join db_a a
          on pa.id_a = a.id_a -- id_a를 key로 => a에서 content_a 가져옴
    
          WHERE pa.id_a IS NOT NULL
    
          -- order by pe.id, pa.id;
    
        `;
    
        let query = baseQuery;
        let params: any[] = [];
        
        if (id_a && id_a.length > 0) {
          const placeholders = id_a.map(() => '?').join(',');
          query += ` AND pa.id_a IN (${placeholders})`;
          params = id_a;
        }
        
        // query += ` ORDER BY a.id, pe.id, pa.id`; // a.id 추가 (select에는 없음)
    
        // 정렬 기준: boolean 값에 따라 ORDER BY 절 변경
        if (sortByPenalty) {
          // 기본 벌칙순 정렬 (벌칙 정보 기준)
          query += ` ORDER BY pe.id, pa.id`;
        } else {
          // 원인순 정렬 (법조문 기준)
          query += ` ORDER BY a.id, pe.id, pa.id`;
        }    
    
        const result = await this.db.query<LawPenalty>(query, params);
        return result;
      }
    
      async getPenaltyIds(dbContext:DbContext): Promise<string[]> {
        // this.setDbContext(dbContext); // DbContext 설정
        const query = `
            SELECT DISTINCT pa.id_a -- 반환값은 id_a의 배열
            FROM db_penalty_a pa
            WHERE pa.id_a IS NOT NULL
            ORDER BY pa.id_a
        `;
        const rows = await this.db.query<{ id_a: string }>(query);
        return rows.map(row => row.id_a);
      }
    

}