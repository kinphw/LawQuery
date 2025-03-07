class SearchDatabase {
  private db: SqlJsDatabase | null = null;

  constructor(private dataset: Uint8Array) {}

  async init(): Promise<void> {
    console.log("⏳ SQLite DB 초기화 중...");
    const SQL = await initSqlJs({
      locateFile: file => "data:application/wasm;base64," + window.WASM_BASE64.trim()
    });
    
    // const dataset = new window.Dataset();
    // this.db = new SQL.Database(dataset.getDatabaseBinary()); // 데이터베이스 파일 로드
    this.db = new SQL.Database(this.dataset);
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

window.SearchDatabase = SearchDatabase;