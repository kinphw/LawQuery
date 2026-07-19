/**
 * PSD 이행분석 '정밀 대사' 확장 마이그레이션.
 *
 * - foreign_transition_assessment.review_status ENUM 에 'analyzed' 추가(원문 대조 정밀 대사).
 * - foreign_transition_theme(정밀 요약표) 테이블 생성.
 *
 * CREATE TABLE IF NOT EXISTS 는 기존 테이블의 컬럼을 바꾸지 못하므로 ENUM 은 ALTER 로 처리한다.
 * 재실행해도 안전하다(ALTER MODIFY 는 멱등).
 *
 * 실행: npx ts-node scripts/foreign/migrate_transition_precise.ts
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config({ path: path.join(process.cwd(), '.env') });

async function main(): Promise<void> {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.AUTH_DB || 'ldb_auth',
    charset: 'utf8mb4',
    multipleStatements: true,
  });
  try {
    // 1) 스키마 파일 재적용 — theme 테이블 생성(기존 테이블은 IF NOT EXISTS 라 무영향).
    const schema = fs.readFileSync(path.join(process.cwd(), 'db', 'foreign_transition.sql'), 'utf8');
    await connection.query(schema);

    // 2) review_status ENUM 확장(기존 데이터·기본값 보존).
    await connection.query(
      `ALTER TABLE foreign_transition_assessment
         MODIFY review_status ENUM('automatic','analyzed','reviewed')
         NOT NULL DEFAULT 'automatic'`
    );

    const [cols] = await connection.query<any[]>(
      `SELECT COLUMN_TYPE FROM information_schema.columns
        WHERE table_schema=DATABASE() AND table_name='foreign_transition_assessment'
          AND column_name='review_status'`
    );
    const [themeExists] = await connection.query<any[]>(
      `SELECT COUNT(*) AS n FROM information_schema.tables
        WHERE table_schema=DATABASE() AND table_name='foreign_transition_theme'`
    );
    console.log('review_status:', cols[0]?.COLUMN_TYPE);
    console.log('foreign_transition_theme exists:', Number(themeExists[0]?.n) === 1);
    console.log('migration: done');
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
