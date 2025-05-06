import db, { DbContextType } from './DbContext';

export abstract class LawBaseModel {
  protected db: DbContextType;
  
  constructor() {
    this.db = db;
  }
}