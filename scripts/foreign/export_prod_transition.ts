/**
 * PSD 이행분석 dev → prod 이관 SQL 생성기(자기완결형).
 *
 * 운영 DB(ldb_auth)에 직접 접근할 수 없으므로, dev 의 이행분석 데이터를 그대로 운영에 적용할 수 있는
 * 단일 .sql 파일을 만든다. 파일 하나로 스키마·ENUM·데이터가 모두 끝난다.
 *
 *   ① 스키마: db/foreign_transition.sql (CREATE TABLE IF NOT EXISTS — 5개 테이블)
 *   ② ENUM  : review_status 에 'analyzed' 추가(기존 운영 테이블이 구버전일 때 대비, 멱등)
 *   ③ 데이터: 해당 version 의 version/group/member/assessment/theme 를 DELETE 후 dev id 그대로 재INSERT
 *             (FK 정합: member.group_id 등이 dev id 를 그대로 참조하도록 명시 id 사용)
 *
 * 운영 적용(사장님, 터널/SSH 로 prod ldb_auth 에):
 *   mysql -h <prod> -u <user> -p ldb_auth < scratchpad/prod_psd_transition.sql
 *
 * 실행: npx ts-node scripts/foreign/export_prod_transition.ts
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import mysql, { RowDataPacket } from 'mysql2/promise';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const VERSION_CODE = 'eu_psd_commission_2023';
const OUT = 'C:/Users/USER/AppData/Local/Temp/claude/C--projects-LawQuery/b86f3455-b454-4c36-a8ce-f1511b2f8b8d/scratchpad/prod_psd_transition.sql';

async function main(): Promise<void> {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.AUTH_DB || 'ldb_auth',
    charset: 'utf8mb4',
  });
  try {
    const esc = (v: any) => conn.escape(v);
    const escJson = (v: any) => v == null ? 'NULL' : conn.escape(typeof v === 'string' ? v : JSON.stringify(v));

    const [verRows] = await conn.query<RowDataPacket[]>(
      `SELECT id, code, label_ko, basis_ko, DATE_FORMAT(as_of_date,'%Y-%m-%d') AS as_of_date,
              lifecycle, publish_status, source_urls, notice_ko
         FROM foreign_transition_version WHERE code=? LIMIT 1`, [VERSION_CODE]);
    if (!verRows.length) throw new Error('version not found on dev');
    const ver = verRows[0];
    const versionId = Number(ver.id);

    const [groups] = await conn.query<RowDataPacket[]>(
      `SELECT id, version_id, group_key, source_row_no, relation_shape, evidence_status,
              conflict_note, psd3_row_json, psr_row_json
         FROM foreign_transition_group WHERE version_id=? ORDER BY id`, [versionId]);
    const [members] = await conn.query<RowDataPacket[]>(
      `SELECT m.id, m.group_id, m.side, m.law_code, m.article_no, m.display_ref, m.raw_ref, m.member_order
         FROM foreign_transition_member m
         JOIN foreign_transition_group g ON g.id=m.group_id
        WHERE g.version_id=? ORDER BY m.id`, [versionId]);
    const [assess] = await conn.query<RowDataPacket[]>(
      `SELECT id, version_id, law_code, article_no, structural_type, change_type,
              summary_ko, detail_ko, similarity_pct, review_status
         FROM foreign_transition_assessment WHERE version_id=? ORDER BY id`, [versionId]);
    const [themes] = await conn.query<RowDataPacket[]>(
      `SELECT id, version_id, theme_key, sort_order, category_ko, title_ko, impact,
              current_ref_ko, future_ref_ko, summary_ko, detail_ko, article_links, publish_status
         FROM foreign_transition_theme WHERE version_id=? ORDER BY id`, [versionId]);

    const schema = fs.readFileSync(path.join(process.cwd(), 'db', 'foreign_transition.sql'), 'utf8');

    const lines: string[] = [];
    lines.push('-- PSD 이행분석 dev → prod 이관 (자기완결형). 생성: export_prod_transition.ts');
    lines.push(`-- version=${VERSION_CODE}, groups=${groups.length}, members=${members.length}, assessments=${assess.length}, themes=${themes.length}`);
    lines.push('SET NAMES utf8mb4;');
    lines.push('');
    lines.push('-- ① 스키마(멱등) --------------------------------------------------------');
    lines.push(schema.trim());
    lines.push('');
    lines.push('-- ② review_status ENUM 확장(구버전 운영 테이블 대비, 멱등) --------------');
    lines.push(`ALTER TABLE ldb_auth.foreign_transition_assessment
  MODIFY review_status ENUM('automatic','analyzed','reviewed') NOT NULL DEFAULT 'automatic';`);
    lines.push('');
    lines.push('-- ③ 데이터(버전 통째 교체) ----------------------------------------------');
    lines.push('START TRANSACTION;');
    lines.push(`DELETE FROM ldb_auth.foreign_transition_version WHERE code=${esc(VERSION_CODE)}; -- CASCADE 로 group/member/assessment/theme 동시 삭제`);
    lines.push('');

    lines.push('INSERT INTO ldb_auth.foreign_transition_version (id, code, label_ko, basis_ko, as_of_date, lifecycle, publish_status, source_urls, notice_ko) VALUES');
    lines.push(`  (${versionId}, ${esc(ver.code)}, ${esc(ver.label_ko)}, ${esc(ver.basis_ko)}, ${esc(ver.as_of_date)}, ${esc(ver.lifecycle)}, ${esc(ver.publish_status)}, ${escJson(ver.source_urls)}, ${esc(ver.notice_ko)});`);
    lines.push('');

    emitBatch(lines, 'ldb_auth.foreign_transition_group',
      '(id, version_id, group_key, source_row_no, relation_shape, evidence_status, conflict_note, psd3_row_json, psr_row_json)',
      groups.map(g => `(${g.id}, ${g.version_id}, ${esc(g.group_key)}, ${g.source_row_no}, ${esc(g.relation_shape)}, ${esc(g.evidence_status)}, ${esc(g.conflict_note)}, ${escJson(g.psd3_row_json)}, ${escJson(g.psr_row_json)})`));

    emitBatch(lines, 'ldb_auth.foreign_transition_member',
      '(id, group_id, side, law_code, article_no, display_ref, raw_ref, member_order)',
      members.map(m => `(${m.id}, ${m.group_id}, ${esc(m.side)}, ${esc(m.law_code)}, ${esc(m.article_no)}, ${esc(m.display_ref)}, ${esc(m.raw_ref)}, ${m.member_order})`));

    emitBatch(lines, 'ldb_auth.foreign_transition_assessment',
      '(id, version_id, law_code, article_no, structural_type, change_type, summary_ko, detail_ko, similarity_pct, review_status)',
      assess.map(a => `(${a.id}, ${a.version_id}, ${esc(a.law_code)}, ${esc(a.article_no)}, ${esc(a.structural_type)}, ${esc(a.change_type)}, ${esc(a.summary_ko)}, ${esc(a.detail_ko)}, ${a.similarity_pct == null ? 'NULL' : esc(a.similarity_pct)}, ${esc(a.review_status)})`));

    emitBatch(lines, 'ldb_auth.foreign_transition_theme',
      '(id, version_id, theme_key, sort_order, category_ko, title_ko, impact, current_ref_ko, future_ref_ko, summary_ko, detail_ko, article_links, publish_status)',
      themes.map(t => `(${t.id}, ${t.version_id}, ${esc(t.theme_key)}, ${t.sort_order}, ${esc(t.category_ko)}, ${esc(t.title_ko)}, ${esc(t.impact)}, ${esc(t.current_ref_ko)}, ${esc(t.future_ref_ko)}, ${esc(t.summary_ko)}, ${esc(t.detail_ko)}, ${escJson(t.article_links)}, ${esc(t.publish_status)})`));

    lines.push('COMMIT;');
    lines.push('');
    lines.push('-- 검증 예시:');
    lines.push(`--   SELECT review_status, COUNT(*) FROM ldb_auth.foreign_transition_assessment WHERE version_id=${versionId} GROUP BY review_status;`);
    lines.push(`--   SELECT COUNT(*) FROM ldb_auth.foreign_transition_theme WHERE version_id=${versionId};`);

    fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
    const bytes = fs.statSync(OUT).size;
    console.log(`export: ${OUT} (${(bytes / 1024).toFixed(0)} KB)`);
    console.log(`version_id=${versionId} groups=${groups.length} members=${members.length} assessments=${assess.length} themes=${themes.length}`);
  } finally {
    await conn.end();
  }
}

/** INSERT ... VALUES 를 500행씩 나눠 안전하게. */
function emitBatch(lines: string[], table: string, cols: string, rows: string[]): void {
  if (!rows.length) { lines.push(`-- ${table}: (없음)`); lines.push(''); return; }
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    lines.push(`INSERT INTO ${table} ${cols} VALUES`);
    lines.push(slice.map((r, j) => '  ' + r + (j === slice.length - 1 ? ';' : ',')).join('\n'));
  }
  lines.push('');
}

main().catch(e => { console.error(e instanceof Error ? e.stack : e); process.exit(1); });
