import { LawBaseModel } from '../models/LawBaseModel';

// 제네릭 추가
export abstract class BaseLawController<T extends LawBaseModel = LawBaseModel> {
  protected model: T;
  
  constructor(model: T) {
    this.model = model;
  }
}