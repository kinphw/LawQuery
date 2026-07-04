import mysql, { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';

class DbContext {
    private static instances: { [dbName: string]: DbContext } = {};
    private pool: Pool;

    private constructor(dbName: string) {

        // .env 파일 로드
        dotenv.config({ path: path.join(process.cwd(), '.env') });

        this.pool = mysql.createPool({
            host: process.env.MYSQL_HOST || 'localhost',
            user: process.env.MYSQL_USER,
            password: process.env.MYSQL_PASSWORD,
            database: dbName, // 동적으로 설정
            port: parseInt(process.env.MYSQL_PORT || '3306'),
            waitForConnections: true,
            connectionLimit: 10,
            charset: 'utf8mb4',
            timezone: '+09:00', // 한국 시간대(KST) 설정
            dateStrings: true, // datetime을 문자열로 반환하여 timezone 변환 방지 (UTC 문제 해결)
        });

        // 🔥 새 커넥션이 열릴 때마다 group_concat_max_len 세팅 
        this.pool.on('connection', (connection) => {
            connection.query("SET NAMES utf8mb4 COLLATE utf8mb4_uca1400_ai_ci;");
            connection.query("SET SESSION collation_connection = 'utf8mb4_uca1400_ai_ci';");
            connection.query('SET SESSION group_concat_max_len = 1000000;');
        });
    }

    // 캐시된 인스턴스(=커넥션 풀) 수 상한. 실제 사용 DB는 십수 개 수준이라 넉넉하다.
    // ⚠️ DoS 방어: 검증되지 않은 입력으로 DB명이 만들어질 경우(과거 law 파라미터) 유니크 값마다
    //   풀이 무한 생성되는 것을 막는 최종 방어선. 상한 초과 시 새 풀 생성을 거부한다.
    private static readonly MAX_INSTANCES = 128;

    public static getInstance(dbName: string): DbContext {
        if (!this.instances[dbName]) {
            if (Object.keys(this.instances).length >= DbContext.MAX_INSTANCES) {
                throw new Error(`DbContext 인스턴스 상한(${DbContext.MAX_INSTANCES}) 초과: ${dbName}`);
            }
            this.instances[dbName] = new DbContext(dbName);
        }
        return this.instances[dbName];
    }

    // ✅ 제네릭으로 통일 (자동완성 잘 됨!)
    public async query<T extends any = any>(sql: string, values?: any[]): Promise<T[]> {
      const [rows] = await this.pool.query(sql, values);
      return rows as T[];
    }

    public async getConnection(): Promise<PoolConnection> {
        return this.pool.getConnection();
    }

    public async end(): Promise<void> {
        await this.pool.end();
    }
}

// 싱글톤 인스턴스 생성 및 내보내기
// const db = DbContext.getInstance();

// 기본 내보내기로 db 인스턴스만 제공
// export default db;

export default DbContext;

// 필요한 경우 타입으로 DbContext 클래스에 접근 가능하도록 타입 내보내기.
export type DbContextType = DbContext;