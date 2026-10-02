import mysql, { Pool } from 'mysql2/promise';
import path from 'path';

/**
 * 기관 보도자료 코퍼스(stn_press_db) 연결 — **읽기 전용**.
 *
 * 이 DB 의 주인은 stn-crawler(C:\projects\stn-crawler)다. 웹앱은 SELECT 만 한다(인덱스 추가·보정도 그쪽 일).
 * 계정은 소비자용 읽기 계정을 따로 쓴다(.env 의 PRESS_DB_USER / PRESS_DB_PASSWORD). 없으면 웹앱 계정으로
 * 시도하지만, 그 계정엔 보통 이 DB 권한이 없다.
 *
 * DbContext 를 쓰지 않는 이유: 계정이 다르고, DbContext 는 로컬(오프라인) 빌드에서 sql.js 로 치환되는 모듈이라
 * 보도자료(로컬판 미포함)를 거기에 얹으면 치환 대상이 늘어난다.
 */
export const PRESS_DB_NAME = process.env.PRESS_DB_NAME || 'stn_press_db';

/** raw 파일 루트 — `<루트>/<source>/<folder>/<file_name>` (stn-crawler 의 data 폴더). */
export const PRESS_FILES_DIR = path.resolve(process.env.PRESS_FILES_DIR || 'C:/projects/stn-crawler/data');

/** HWP 등을 PDF 로 바꿔 둔 캐시. */
export const PRESS_PDF_CACHE_DIR = path.resolve(process.env.PRESS_PDF_CACHE_DIR || path.join(process.cwd(), 'cache', 'press-pdf'));

export const PYTHON_BIN = process.env.PYTHON_BIN || 'python';

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT || '3306'),
      user: process.env.PRESS_DB_USER || process.env.MYSQL_USER,
      password: process.env.PRESS_DB_USER ? process.env.PRESS_DB_PASSWORD : process.env.MYSQL_PASSWORD,
      database: PRESS_DB_NAME,
      waitForConnections: true,
      connectionLimit: 5,
      charset: 'utf8mb4',
      dateStrings: true,
    });
  }
  return pool;
}

export async function pressQuery<T = any>(sql: string, values?: any[]): Promise<T[]> {
  const [rows] = await getPool().query(sql, values);
  return rows as T[];
}
