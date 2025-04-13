// src/frontend/ts/common/types/sql.ts

// 1. 타입 정의
export interface SqlJs {
    Database: {
      new(data: Uint8Array): SqlJsDatabase;
    };
  }
  
  export interface SqlJsDatabase {
    exec(sql: string, params?: any[]): SqlJsResult[];
  }
  
  export interface SqlJsResult {
    columns: string[];
    values: any[][];
  }
  
  // 2. 전역(window)에 등록된 initSqlJs를 타입스크립트에 인식시킴
  declare global {
    interface Window {
      initSqlJs: (config: { locateFile: (file: string) => string }) => Promise<SqlJs>;
    }
  }
  
  // 3. 전역 객체에서 가져와 export
  const initSqlJs = window.initSqlJs;
  export { initSqlJs };
  