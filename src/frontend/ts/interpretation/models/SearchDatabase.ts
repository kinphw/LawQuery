import { initSqlJs, SqlJsDatabase } from "../../common/types/sql.js";

export class SearchDatabase {
  private db: SqlJsDatabase | null = null;

  // constructor(private dataset: Uint8Array) {}

  async init(): Promise<void> {
    console.log("⏳ SQLite DB 초기화 중...");
    const SQL = await initSqlJs({
      locateFile: file => `assets/vendor/${file}`
    });
    
    // this.db = new SQL.Database(this.dataset);

    // DB 파일 직접 로드
    const response = await fetch('data/db_i.db');
    const dbBuffer = await response.arrayBuffer();
    this.db = new SQL.Database(new Uint8Array(dbBuffer));        

    console.log("✅ SQLite DB 초기화 완료!");
  }

  executeQuery(query: string, params: any[] = []): any[] {
    if (!this.db) throw new Error("Database not initialized");
    const result = this.db.exec(query, params);
    if (!result.length) return [];
    
    const columns:string[] = result[0].columns;
    return result[0].values.map((row:any[]) => {
      const obj: Record<string,any> = {};
      columns.forEach((col, i) => obj[col] = row[i]);
      return obj;
    });
  }
}