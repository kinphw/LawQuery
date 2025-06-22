import db, { DbContextType } from '../../common/DbContext';

export abstract class LawBaseModel {
  protected db: DbContextType;
  
  constructor() {
    this.db = db.getInstance('ldb_j'); // 명시적으로 호출
  }

  // DbContext 설정 메서드
  protected setDbContext(dbContext: DbContextType): void {
    this.db = dbContext;
  }  
}