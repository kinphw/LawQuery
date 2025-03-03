class LawDatabase {
    private db: any;

    constructor(private dataset: Uint8Array) {}

    async init(): Promise<void> {
        console.log("⏳ 법령 DB 초기화 중...");
        const SQL = await initSqlJs({
            locateFile: file => "data:application/wasm;base64," + window.WASM_BASE64.trim()
        });
        
        this.db = new SQL.Database(this.dataset);
        console.log("✅ 법령 DB 초기화 완료!");
    }

    executeQuery(query: string, params: any[] = []): any[] {
        if (!this.db) throw new Error("Database not initialized");
        
        const result = this.db.exec(query, params);
        if (!result.length) return [];
        
        const columns = result[0].columns;
        return result[0].values.map((row: any[]) => {
            const obj: {[key: string]: any} = {};
            columns.forEach((col: string, i: number) => obj[col] = row[i]);
            return obj;
        });
    }
}

window.LawDatabase = LawDatabase;