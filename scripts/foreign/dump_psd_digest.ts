/**
 * PSD 정밀 대사 결과 다이제스트 덤프 — 요약표(테마) 종합 입력용.
 *
 * foreign_transition_assessment(정밀 대사 완료분)를 조문별로 압축 요약해
 * scratchpad/psd_digest.json 으로 내보낸다. 대응 조문(counterparts)까지 붙여
 * 테마 종합 시 근거 조문(article_links)을 정확히 달 수 있게 한다.
 *
 * 실행: npx ts-node scripts/foreign/dump_psd_digest.ts
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import mysql, { RowDataPacket } from 'mysql2/promise';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const VERSION_ORDER: Record<string, string[]> = {
  eu_psd_commission_2023: ['eu_psd2', 'eu_emd2', 'eu_psd3', 'eu_psr'],
  eu_psd_agreed_2026: ['eu_psd2', 'eu_emd2', 'eu_psd3_2026', 'eu_psr_2026'],
};
const VERSION_CODE = (() => {
  const i = process.argv.indexOf('--version');
  const v = i >= 0 ? process.argv[i + 1] : 'eu_psd_commission_2023';
  if (!VERSION_ORDER[v]) throw new Error(`--version 은 ${Object.keys(VERSION_ORDER).join(' | ')} 중 하나`);
  return v;
})();
const SCRATCH = 'C:/Users/USER/AppData/Local/Temp/claude/C--projects-LawQuery/b86f3455-b454-4c36-a8ce-f1511b2f8b8d/scratchpad';
const OUT = `${SCRATCH}/psd_digest${VERSION_CODE === 'eu_psd_agreed_2026' ? '_2026' : ''}.json`;
const ORDER = `FIELD(law_code,${VERSION_ORDER[VERSION_CODE].map(c => `'${c}'`).join(',')}), CAST(article_no AS UNSIGNED)`;

async function main(): Promise<void> {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.AUTH_DB || 'ldb_auth',
    charset: 'utf8mb4',
  });
  try {
    const [verRows] = await connection.query<any[]>(
      'SELECT id FROM foreign_transition_version WHERE code=? LIMIT 1', [VERSION_CODE]);
    const versionId = Number(verRows[0].id);

    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT a.law_code, a.article_no, a.structural_type, a.change_type, a.review_status, a.summary_ko,
              (SELECT l.heading_ko FROM fin_law_db.law fl
                 JOIN fin_law_db.law_provision l ON l.law_id=fl.id
                WHERE fl.code=a.law_code AND l.article_no=a.article_no AND l.heading_ko IS NOT NULL
                LIMIT 1) AS heading_ko
         FROM foreign_transition_assessment a
        WHERE a.version_id=?
        ORDER BY ${ORDER}`, [versionId]);

    // 대응 조문(카운터파트) 붙이기
    const [rel] = await connection.query<RowDataPacket[]>(
      `SELECT self.law_code AS s_law, self.article_no AS s_art,
              other.law_code AS o_law, other.article_no AS o_art
         FROM foreign_transition_member self
         JOIN foreign_transition_group g ON g.id=self.group_id AND g.version_id=?
         JOIN foreign_transition_member other ON other.group_id=g.id AND other.side<>self.side
        WHERE self.article_no IS NOT NULL AND other.article_no IS NOT NULL
          AND self.article_no REGEXP '^[0-9]+$' AND other.article_no REGEXP '^[0-9]+$'`, [versionId]);
    const cp = new Map<string, Set<string>>();
    for (const r of rel) {
      const k = `${r.s_law}|${r.s_art}`;
      (cp.get(k) || cp.set(k, new Set()).get(k)!).add(`${r.o_law}:${r.o_art}`);
    }

    const digest = rows.map(r => ({
      law: r.law_code, art: r.article_no, heading: r.heading_ko || '',
      structural: r.structural_type, change: r.change_type, status: r.review_status,
      counterparts: [...(cp.get(`${r.law_code}|${r.article_no}`) || [])],
      summary: r.summary_ko || '',
    }));
    fs.writeFileSync(OUT, JSON.stringify(digest, null, 1), 'utf8');
    const byStatus = digest.reduce<Record<string, number>>((a, d) => { a[d.status] = (a[d.status] || 0) + 1; return a; }, {});
    console.log(`digest: ${digest.length}행 → ${OUT}`);
    console.log('status:', JSON.stringify(byStatus));
  } finally {
    await connection.end();
  }
}

main().catch(error => { console.error(error instanceof Error ? error.stack : error); process.exit(1); });
