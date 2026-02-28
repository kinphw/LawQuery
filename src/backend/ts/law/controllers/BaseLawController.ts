import { LawBaseModel } from '../models/LawBaseModel';
import DbContext, { DbContextType } from '../../common/DbContext';

// 제네릭 추가
export abstract class BaseLawController<T extends LawBaseModel = LawBaseModel> {
  protected model: T;
  
  constructor(model: T) {
    this.model = model;
  }

  // DbContext를 동적으로 설정하는 메서드
  protected getDbContext(law: string): DbContext {
    const dbContext: DbContextType = DbContext.getInstance(`ldb_${law}`);
    return dbContext;
  }
}