import mysql, { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';

class DbContext {
    private static instance: DbContext;
    private pool: Pool;

    private constructor() {

        // .env 파일 로드 (상대 경로로 프로젝트 루트의 .env 파일 지정)
        dotenv.config({ path: path.resolve(__dirname, '../../../../../.env') });

        this.pool = mysql.createPool({
            host: process.env.MYSQL_HOST || 'localhost',
            user: process.env.MYSQL_USER,
            password: process.env.MYSQL_PASSWORD,
            database: process.env.MYSQL_DB,
            port: parseInt(process.env.MYSQL_PORT || '3306'),
            waitForConnections: true,
            connectionLimit: 10,
        });

        // 🔥 새 커넥션이 열릴 때마다 group_concat_max_len 세팅
        this.pool.on('connection', (connection) => {
            connection.query('SET SESSION group_concat_max_len = 1000000;');
        });
    }

    public static getInstance(): DbContext {
        if (!DbContext.instance) {
            DbContext.instance = new DbContext();
        }
        return DbContext.instance;
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
const db = DbContext.getInstance();

// 기본 내보내기로 db 인스턴스만 제공
export default db;

// 필요한 경우 타입으로 DbContext 클래스에 접근 가능하도록 타입 내보내기
export type DbContextType = DbContext;