import { LawBaseModel } from '../models/LawBaseModel';
import DbContext, { DbContextType } from '../../common/DbContext';

// 제네릭 추가
export abstract class BaseLawController<T extends LawBaseModel = LawBaseModel> {
  protected model: T;
  
  constructor(model: T) {
    this.model = model;
  }

  // DbContext를 동적으로 설정하는 메서드
  protected getDbContext(dbName: string): DbContext {

    if (dbName == 'j') {
      dbName = 'ldb_j'; // 기본값으로 설정
    } else if (dbName == 'y') {
      dbName = 'ldb_y'; // 기본값으로 설정  
    }

    const dbContext: DbContextType = DbContext.getInstance(dbName);
    // this.model.setDbContext(dbContext);
    return dbContext;
  }
}