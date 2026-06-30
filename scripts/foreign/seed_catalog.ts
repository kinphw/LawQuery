/**
 * foreign_catalog 시드 — 현재 fin_law_db.law 메타 + foreignIntro.ts(설명/태그/highlights)를
 * ldb_auth.foreign_catalog 로 1회 이전. 이후 카탈로그 큐레이션은 DB(허브 편집)에서 관리.
 *
 * 실행:  FINDB_ROOT_PW=genius npx ts-node scripts/foreign/seed_catalog.ts
 */
import mysql from 'mysql2/promise';
import { FOREIGN_INTRO } from '../../src/frontend/ts/foreign/foreignIntro';

(async () => {
  const pw = process.env.FINDB_ROOT_PW || 'genius';
  const fin = await mysql.createConnection({ host: 'localhost', user: 'root', password: pw, database: 'fin_law_db', charset: 'utf8mb4' });
  const auth = await mysql.createConnection({ host: 'localhost', user: 'root', password: pw, database: 'ldb_auth', charset: 'utf8mb4' });

  const [laws] = await fin.query<any[]>(
    'SELECT code, jurisdiction, title_ko, abbrev, status, law_type, is_crypto FROM law'
  );
  let n = 0, withIntro = 0;
  for (const l of laws as any[]) {
    const intro: any = (FOREIGN_INTRO as any)[l.code] || {};
    if (intro.summary) withIntro++;
    await auth.query(
      `INSERT INTO foreign_catalog
         (code, jurisdiction, title_ko, abbrev, status, law_type, is_crypto, summary, tags, highlights, sort_order)
       VALUES (?,?,?,?,?,?,?,?,?,?,100)
       ON DUPLICATE KEY UPDATE
         jurisdiction=VALUES(jurisdiction), title_ko=VALUES(title_ko), abbrev=VALUES(abbrev),
         status=VALUES(status), law_type=VALUES(law_type), is_crypto=VALUES(is_crypto),
         summary=VALUES(summary), tags=VALUES(tags), highlights=VALUES(highlights)`,
      [l.code, l.jurisdiction, l.title_ko, l.abbrev, l.status, l.law_type, l.is_crypto,
        intro.summary || null,
        intro.tags ? JSON.stringify(intro.tags) : null,
        intro.highlights ? JSON.stringify(intro.highlights) : null]
    );
    n++;
  }
  console.log(`seeded ${n} laws (설명 있는 것 ${withIntro})`);
  await fin.end();
  await auth.end();
})().catch(e => { console.error(e); process.exit(1); });
