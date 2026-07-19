/**
 * PSD 정밀 대사 결과 적재.
 *
 * 워크플로(psd_precise_workflow.mjs)가 남긴 journal.jsonl 의 각 에이전트 결과
 * ({assessments:[{law_code, article_no, change_type, summary_ko, detail_ko}]}) 를 읽어
 * foreign_transition_assessment 에 UPSERT 한다. review_status='analyzed'(정밀 대사).
 *
 * - article_no 는 숫자만으로 정규화("제73조"→"73").
 * - 대상은 해당 version 의 기존 assessment 행에 한정(구조 대응은 공식 Annex III 소관, 여기선 내용만).
 * - --dry 면 커밋 없이 커버리지·충돌만 보고.
 *
 * 실행:
 *   npx ts-node scripts/foreign/apply_psd_precise.ts --journal "<...>/journal.jsonl" [--dry]
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import mysql, { RowDataPacket } from 'mysql2/promise';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const VERSION_CODE = 'eu_psd_commission_2023';
const LAW_CODES = new Set(['eu_psd2', 'eu_emd2', 'eu_psd3', 'eu_psr']);
const CHANGE_TYPES = new Set(['maintained', 'clarified', 'strengthened', 'relaxed', 'material_change', 'pending']);

interface Item { law_code: string; article_no: string; change_type: string; summary_ko: string; detail_ko: string; }

function normArticle(value: string): string {
  const m = String(value || '').match(/\d+/);
  return m ? m[0] : String(value || '').trim();
}

function argValues(flag: string): string[] {
  const out: string[] = [];
  process.argv.forEach((a, i) => { if (a === flag && i + 1 < process.argv.length) out.push(process.argv[i + 1]); });
  return out;
}

function collectFromResult(result: any, out: Item[]): void {
  const list = result?.assessments;
  if (!Array.isArray(list)) return;
  for (const a of list) {
    if (!a || !LAW_CODES.has(a.law_code)) continue;
    const article_no = normArticle(a.article_no);
    const change_type = String(a.change_type || '').trim();
    const summary_ko = String(a.summary_ko || '').trim();
    if (!article_no || !CHANGE_TYPES.has(change_type) || !summary_ko) continue;
    out.push({ law_code: a.law_code, article_no, change_type, summary_ko, detail_ko: String(a.detail_ko || '').trim() });
  }
}

async function main(): Promise<void> {
  const journalPaths = argValues('--journal');
  const dry = process.argv.includes('--dry');
  if (!journalPaths.length) throw new Error('사용법: --journal <path> [--journal <path> ...]');
  for (const p of journalPaths) if (!fs.existsSync(p)) throw new Error(`journal 파일을 찾을 수 없습니다: ${p}`);

  // 저널 파싱 — {"type":"result","result":{assessments:[...]}} 라인만. 여러 저널 누적.
  const items: Item[] = [];
  let resultLines = 0;
  for (const journalPath of journalPaths) {
    for (const line of fs.readFileSync(journalPath, 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue;
      let rec: any;
      try { rec = JSON.parse(line); } catch { continue; }
      if (rec?.type !== 'result') continue;
      resultLines++;
      collectFromResult(rec.result, items);
    }
  }

  // 같은 (law, article) 중복 시 마지막 것 채택(정상적으론 클러스터 분해로 중복 없음).
  const byKey = new Map<string, Item>();
  const dup: string[] = [];
  for (const it of items) {
    const k = `${it.law_code}|${it.article_no}`;
    if (byKey.has(k)) dup.push(k);
    byKey.set(k, it);
  }

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

    const [existing] = await connection.query<RowDataPacket[]>(
      'SELECT law_code, article_no FROM foreign_transition_assessment WHERE version_id=?', [versionId]);
    const existSet = new Set(existing.map(r => `${r.law_code}|${r.article_no}`));

    const matched = [...byKey.values()].filter(it => existSet.has(`${it.law_code}|${it.article_no}`));
    const unknown = [...byKey.values()].filter(it => !existSet.has(`${it.law_code}|${it.article_no}`));
    const missing = [...existSet].filter(k => !byKey.has(k));

    console.log(`journal result 라인: ${resultLines}`);
    console.log(`파싱된 assessment: ${items.length} (고유 ${byKey.size}, 중복 ${dup.length})`);
    console.log(`기존 assessment: ${existSet.size} / 매칭: ${matched.length} / 미커버: ${missing.length} / 미상(테이블에 없음): ${unknown.length}`);
    if (unknown.length) console.log('  미상 예시:', unknown.slice(0, 10).map(x => `${x.law_code}|${x.article_no}`).join(', '));
    if (missing.length) console.log('  미커버 예시:', missing.slice(0, 20).join(', '));

    if (dry) { console.log('\n--dry: 커밋 없이 종료'); return; }

    await connection.beginTransaction();
    let updated = 0;
    for (const it of matched) {
      const [res] = await connection.execute<mysql.ResultSetHeader>(
        `UPDATE foreign_transition_assessment
            SET change_type=?, summary_ko=?, detail_ko=?, review_status='analyzed',
                reviewed_by=NULL, reviewed_at=NULL
          WHERE version_id=? AND law_code=? AND article_no=?
            AND review_status <> 'reviewed'`,
        [it.change_type, it.summary_ko, it.detail_ko || null, versionId, it.law_code, it.article_no]
      );
      updated += res.affectedRows;
    }
    await connection.commit();
    console.log(`\nUPSERT 완료: ${updated}행 analyzed 로 갱신 (reviewed 행은 보존)`);

    const [dist] = await connection.query<RowDataPacket[]>(
      `SELECT review_status, COUNT(*) n FROM foreign_transition_assessment
        WHERE version_id=? GROUP BY review_status`, [versionId]);
    console.log('review_status 분포:', dist.map(r => `${r.review_status}=${r.n}`).join(', '));
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch(error => { console.error(error instanceof Error ? error.stack : error); process.exit(1); });
