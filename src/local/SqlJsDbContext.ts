/**
 * 로컬판 DB 컨텍스트 — MySQL(mysql2) 자리에 sql.js(SQLite WASM)를 끼운다.
 *
 * ★ 이 파일은 webpack NormalModuleReplacementPlugin 으로 common/DbContext 를 "대체"한다.
 *   따라서 백엔드 Model/Controller 코드는 한 글자도 고치지 않는다.
 *   → getInstance() 는 동기, query() 는 비동기 라는 원본의 계약을 그대로 지킨다.
 *     (DB 파일 로딩은 query() 안에서 lazy 하게 await 된다)
 *
 * DB 파일 조달 경로 2가지 — 배포 형태에 따라 자동 선택:
 *   http(s):  fetch('db/<dbName>.sqlite')          … 폴더 배포·인트라넷 호스팅. 필요한 법령만 지연 로딩.
 *   file://   window.LQ_OFFLINE_DB[dbName] (base64) … fetch 가 차단되므로 <script> 로 실어 나른 것을 쓴다.
 */
import initSqlJs from 'sql.js';
import type { Database, SqlJsStatic } from 'sql.js';

declare global {
  interface Window {
    LQ_OFFLINE_DB?: Record<string, string>; // dbName → base64 (file:// 배포용)
    LQ_WASM_B64?: string;                   // sql-wasm.wasm base64 (file:// 배포용)
    LQ_DB_BASE?: string;                    // sqlite 파일 디렉토리 (기본 'db')
  }
}

const isFileProtocol = (): boolean => location.protocol === 'file:';

/** base64 → Uint8Array (최초 2025-03 버전이 쓰던 것과 같은 변환) */
function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** sql.js 엔진 초기화 — 전역 1회만. */
let enginePromise: Promise<SqlJsStatic> | null = null;
function getEngine(): Promise<SqlJsStatic> {
  if (enginePromise) return enginePromise;
  const started = initSqlJs({
    // 임베딩된 WASM 이 있으면 그것을 쓴다(file:// 은 .wasm 을 fetch 할 수 없다).
    // 프로토콜이 아니라 "가진 것"으로 판단해야 http 로 열어도 같은 경로를 검증할 수 있다.
    locateFile: (file: string) =>
      window.LQ_WASM_B64
        ? `data:application/wasm;base64,${window.LQ_WASM_B64}`
        : `${file}`,
  });
  enginePromise = started;
  return started;
}

/**
 * MySQL 전용 함수 중 Model 이 실제로 쓰는 것만 SQLite 에 보충한다.
 * 현재 법령·해석 Model 이 쓰는 비호환은 REGEXP 하나뿐(LawModel 3곳).
 */
function installCompatFunctions(db: Database): void {
  // MySQL:  expr REGEXP pattern   /  SQLite: REGEXP 연산자는 사용자 함수로 제공해야 한다.
  db.create_function('regexp', (pattern: string, value: string | null) => {
    if (value == null) return 0;
    try {
      return new RegExp(pattern).test(String(value)) ? 1 : 0;
    } catch {
      return 0;
    }
  });
}

class SqlJsDbContext {
  private static instances: { [dbName: string]: SqlJsDbContext } = {};

  private readonly dbName: string;
  private db: Database | null = null;
  private loading: Promise<Database> | null = null;

  private constructor(dbName: string) {
    this.dbName = dbName;
  }

  /** 원본 DbContext 와 동일한 시그니처(동기). 실제 파일 로딩은 첫 query 때 일어난다. */
  public static getInstance(dbName: string): SqlJsDbContext {
    if (!this.instances[dbName]) {
      this.instances[dbName] = new SqlJsDbContext(dbName);
    }
    return this.instances[dbName];
  }

  /** 이미 로드된 DB 목록(진단·프리로드 판단용) */
  public static loadedNames(): string[] {
    return Object.keys(SqlJsDbContext.instances).filter((n) => SqlJsDbContext.instances[n].db !== null);
  }

  private async open(): Promise<Database> {
    if (this.db) return this.db;
    if (this.loading) return this.loading;

    this.loading = (async () => {
      const SQL = await getEngine();

      // 1순위: 페이지에 함께 실려 온 base64 임베딩(file:// 배포본).
      // 2순위: db/<name>.sqlite 지연 로딩(http 배포본 — 필요한 법령만 읽어 가볍고 빠르다).
      let bytes: Uint8Array;
      const embedded = window.LQ_OFFLINE_DB?.[this.dbName];
      if (embedded) {
        bytes = base64ToBytes(embedded);
      } else if (isFileProtocol()) {
        throw new Error(
          `[로컬판] '${this.dbName}' 데이터가 임베딩되어 있지 않습니다. ` +
          `웹서버 없이 여실 경우 file:// 배포본(dist-local-offline)을 사용하세요.`,
        );
      } else {
        const base = window.LQ_DB_BASE ?? 'db';
        const res = await fetch(`${base}/${this.dbName}.sqlite`);
        if (!res.ok) throw new Error(`[로컬판] ${this.dbName}.sqlite 를 불러오지 못했습니다 (HTTP ${res.status})`);
        bytes = new Uint8Array(await res.arrayBuffer());
      }

      const db = new SQL.Database(bytes);
      installCompatFunctions(db);
      this.db = db;
      return db;
    })();

    return this.loading;
  }

  /**
   * 원본과 동일: query<T>(sql, values) → 행 객체 배열.
   * mysql2 는 RowDataPacket[] 을, sql.js 는 columns/values 를 주므로 여기서 객체 배열로 맞춘다.
   */
  public async query<T extends any = any>(sql: string, values?: any[]): Promise<T[]> {
    const db = await this.open();
    const stmt = db.prepare(sql);
    try {
      if (values && values.length) {
        // sql.js 는 undefined 를 거부한다 → null 로 정규화.
        stmt.bind(values.map((v) => (v === undefined ? null : v)) as any);
      }
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as unknown as T);
      return rows;
    } finally {
      stmt.free();
    }
  }

  /** 원본 인터페이스 호환용(로컬판은 트랜잭션/커넥션 개념이 없다). */
  public async getConnection(): Promise<SqlJsDbContext> {
    return this;
  }

  public async end(): Promise<void> {
    this.db?.close();
    this.db = null;
    this.loading = null;
  }
}

export default SqlJsDbContext;
export type DbContextType = SqlJsDbContext;
