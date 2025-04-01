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


