import mysql, { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';

// .env 파일 로드 (상대 경로로 프로젝트 루트의 .env 파일 지정)
dotenv.config({ path: path.resolve(__dirname, '../../../../../.env') });

class Database {
    private static instance: Database;
    private pool: Pool;

    private constructor() {
        this.pool = mysql.createPool({
            host: process.env.MYSQL_HOST || 'localhost',
            user: process.env.MYSQL_USER,
            password: process.env.MYSQL_PASSWORD,
            database: process.env.MYSQL_DB,
            port: parseInt(process.env.MYSQL_PORT || '3306'),
            waitForConnections: true,
            connectionLimit: 10,
        });
    }

    public static getInstance(): Database {
        if (!Database.instance) {
            Database.instance = new Database();
        }
        return Database.instance;
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

export default Database.getInstance();