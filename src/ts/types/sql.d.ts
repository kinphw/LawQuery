interface SqlJs {
    Database: {
        new(data: Uint8Array): SqlJsDatabase;
    };
}

interface SqlJsDatabase {
    exec(sql: string, params?: any[]): SqlJsResult[];
}

interface SqlJsResult {
    columns: string[];
    values: any[][];
}

declare const initSqlJs: (config: { locateFile: (file: string) => string }) => Promise<{
    Database: new (data: Uint8Array) => {
        exec(sql: string, params?: any[]): Array<{
            columns: string[];
            values: any[][];
        }>;
    };
}>;

interface Window {
    Dataset: any;
    Database: any;
    SearchModel: any;
    SearchForm: any;

    ResultTable: any;
    Header: any;
    MainView: any;
    SearchController: any;
    App: any;
    WASM_BASE64: string;
}
