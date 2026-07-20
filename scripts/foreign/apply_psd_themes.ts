/**
 * PSD 정밀 요약표(테마) 적재.
 *
 * 조문별 정밀 대사를 주제로 종합한 요약표(JSON 배열)를 foreign_transition_theme 에 UPSERT 한다.
 * 이행분석 '요약' 탭에서 렌더된다. --replace 면 기존 테마를 먼저 비운다(재생성).
 *
 * JSON 항목:
 *   { theme_key, category_ko, title_ko, impact, current_ref_ko, future_ref_ko,
 *     summary_ko, detail_ko, article_links:[{law_code, article_no}] }
 *
 * 실행:
 *   npx ts-node scripts/foreign/apply_psd_themes.ts --file "<...>/psd_themes.json" [--replace]
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import mysql, { RowDataPacket } from 'mysql2/promise';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const VERSION_CODE = 'eu_psd_commission_2023';
const LAW_CODES = new Set(['eu_psd2', 'eu_emd2', 'eu_psd3', 'eu_psr']);
const IMPACTS = new Set(['new', 'strengthened', 'relaxed', 'clarified', 'restructured', 'maintained']);

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

function sanitizeLinks(value: any, valid: Set<string>): { law_code: string; article_no: string }[] {
  if (!Array.isArray(value)) return [];
  const out: { law_code: string; article_no: string }[] = [];
  for (const x of value) {
    const law_code = String(x?.law_code || '').trim();
    const article_no = String(x?.article_no || '').replace(/[^0-9]/g, '');
    if (LAW_CODES.has(law_code) && article_no && valid.has(`${law_code}|${article_no}`)) {
      out.push({ law_code, article_no });
    }
  }
  return out;
}

async function main(): Promise<void> {
  const file = argValue('--file');
  const replace = process.argv.includes('--replace');
  if (!file || !fs.existsSync(file)) throw new Error(`themes 파일을 찾을 수 없습니다: ${file}`);
  const themes = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(themes) || !themes.length) throw new Error('themes JSON 은 비어있지 않은 배열이어야 합니다.');

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
    if (!verRows.length) throw new Error('version not found');
    const versionId = Number(verRows[0].id);

    // 딥링크 검증용 — 존재하는 assessment 조문만 링크 허용.
    const [arts] = await connection.query<RowDataPacket[]>(
      'SELECT law_code, article_no FROM foreign_transition_assessment WHERE version_id=?', [versionId]);
    const validArt = new Set(arts.map(r => `${r.law_code}|${r.article_no}`));

    await connection.beginTransaction();
    if (replace) await connection.execute('DELETE FROM foreign_transition_theme WHERE version_id=?', [versionId]);

    let n = 0, droppedLinks = 0;
    for (let i = 0; i < themes.length; i++) {
      const t = themes[i];
      const impact = IMPACTS.has(t.impact) ? t.impact : 'strengthened';
      const links = sanitizeLinks(t.article_links, validArt);
      droppedLinks += (Array.isArray(t.article_links) ? t.article_links.length : 0) - links.length;
      if (!t.theme_key || !t.title_ko || !t.summary_ko || !t.category_ko) {
        console.warn(`  skip #${i}: 필수 필드 누락 (${t.theme_key || '?'})`);
        continue;
      }
      await connection.execute(
        `INSERT INTO foreign_transition_theme
           (version_id, theme_key, sort_order, category_ko, title_ko, impact,
            current_ref_ko, future_ref_ko, summary_ko, detail_ko, article_links, publish_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')
         ON DUPLICATE KEY UPDATE
           sort_order=VALUES(sort_order), category_ko=VALUES(category_ko), title_ko=VALUES(title_ko),
           impact=VALUES(impact), current_ref_ko=VALUES(current_ref_ko), future_ref_ko=VALUES(future_ref_ko),
           summary_ko=VALUES(summary_ko), detail_ko=VALUES(detail_ko), article_links=VALUES(article_links),
           publish_status='published'`,
        [
          versionId, String(t.theme_key), i, String(t.category_ko), String(t.title_ko), impact,
          t.current_ref_ko ? String(t.current_ref_ko) : null,
          t.future_ref_ko ? String(t.future_ref_ko) : null,
          String(t.summary_ko), t.detail_ko ? String(t.detail_ko) : null,
          JSON.stringify(links),
        ]
      );
      n++;
    }
    await connection.commit();
    console.log(`테마 적재: ${n}건 (링크 드롭 ${droppedLinks}건 — 미존재 조문 참조 제거)`);

    const [cnt] = await connection.query<RowDataPacket[]>(
      'SELECT COUNT(*) c FROM foreign_transition_theme WHERE version_id=?', [versionId]);
    console.log(`총 테마: ${cnt[0].c}`);
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch(error => { console.error(error instanceof Error ? error.stack : error); process.exit(1); });
