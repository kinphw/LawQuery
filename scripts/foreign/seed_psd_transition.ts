/**
 * PSD2/EMD2 -> PSD3/PSR 이행분석 시드.
 *
 * - PSD3와 PSR의 Annex III 공식 상관표를 각각 파싱한다.
 * - 두 표가 일치하면 evidence=both, 다르면 conflict로 원문 양쪽을 보존한다.
 * - 구조 관계는 항/호 문맥을 조문 앵커로 정규화하고, 네 법령의 모든 조에 자동 평가 초안을 만든다.
 * - review_status=reviewed인 전문가 평가는 재실행해도 덮어쓰지 않는다.
 *
 * 실행:
 *   npx ts-node scripts/foreign/seed_psd_transition.ts --migrate
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import mysql, { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const VERSION_CODE = 'eu_psd_commission_2023';
const LAW_COLUMNS = ['eu_psd2', 'eu_emd2', 'eu_psd3', 'eu_psr'] as const;
type LawCode = typeof LAW_COLUMNS[number];
type Side = 'current' | 'future';
type RelationShape = 'one_to_one' | 'split' | 'merge' | 'many_to_many' | 'new' | 'deleted' | 'unmapped';
type StructuralType = Exclude<RelationShape, 'unmapped'> | 'pending';
type ChangeType = 'maintained' | 'clarified' | 'strengthened' | 'relaxed' | 'material_change' | 'pending';

interface RefContext { articleNo: string | null; label: string; }
interface TransitionMember {
  side: Side;
  lawCode: LawCode;
  articleNo: string | null;
  displayRef: string;
  rawRef: string;
  order: number;
}
interface EvidenceRow {
  rowNo: number;
  cells: string[];
  members: TransitionMember[];
}
interface SeedGroup {
  id?: number;
  rowNo: number;
  key: string;
  shape: RelationShape;
  evidence: 'both' | 'psd3_annex' | 'psr_annex' | 'conflict';
  conflictNote: string | null;
  psd3Cells: string[] | null;
  psrCells: string[] | null;
  members: TransitionMember[];
}
interface ArticleRow extends RowDataPacket {
  code: LawCode;
  abbrev: string;
  title_ko: string;
  article_no: string;
  heading: string | null;
  heading_ko: string | null;
  text_original: string;
}

function cleanCell(value: string): string {
  return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseMarkdownTable(text: string): string[][] {
  const lines = String(text || '').split(/\r?\n/).map(x => x.trim()).filter(x => x.startsWith('|'));
  const rows = lines.map(line => line.slice(1, line.endsWith('|') ? -1 : undefined).split('|').map(cleanCell));
  return rows.filter((row, index) => {
    if (index === 0) return false; // 4열 제목
    return !row.every(cell => /^:?-{3,}:?$/.test(cell));
  }).filter(row => row.length >= 4).map(row => row.slice(0, 4));
}

function expandArticleNumbers(cell: string): string[] {
  const result: string[] = [];
  const coveredRanges: Array<[number, number]> = [];
  const rangeRe = /Articles?\s+(\d+)\s*[-–—]\s*(\d+)/gi;
  let m: RegExpExecArray | null;
  while ((m = rangeRe.exec(cell))) {
    const from = Number(m[1]), to = Number(m[2]);
    if (from > 0 && to >= from && to - from <= 30) {
      coveredRanges.push([from, to]);
      for (let n = from; n <= to; n++) result.push(String(n));
    }
  }
  const articleRe = /Article(?:s)?\s+(\d+)/gi;
  while ((m = articleRe.exec(cell))) {
    const n = Number(m[1]);
    if (!coveredRanges.some(([from, to]) => n >= from && n <= to)) result.push(String(n));
  }
  const annex = cell.match(/^Annex\s+([IVXLCDM]+|\d+)/i);
  if (annex) result.push(`ANNEX ${annex[1].toUpperCase()}`);
  return [...new Set(result)];
}

function membersForCell(cellRaw: string, lawCode: LawCode, order: number, context: RefContext): TransitionMember[] {
  const cell = cleanCell(cellRaw);
  if (!cell || /^[-–—]$/.test(cell)) return [];
  const side: Side = lawCode === 'eu_psd2' || lawCode === 'eu_emd2' ? 'current' : 'future';
  const articles = expandArticleNumbers(cell);
  if (articles.length) {
    context.articleNo = articles[0];
    context.label = cell.replace(/:$/, '');
    return articles.map(articleNo => ({ side, lawCode, articleNo, displayRef: cell, rawRef: cell, order }));
  }

  // Article 다음 행의 Letter/Point/paragraph는 직전 명시 Article 문맥에 속한다.
  const continuation = /^(letters?|points?|paragraphs?|subparagraphs?|items?|\([a-z0-9ivx]+\))/i.test(cell);
  if (continuation && context.articleNo) {
    return [{
      side, lawCode, articleNo: context.articleNo,
      displayRef: `${context.label} / ${cell}`,
      rawRef: cell, order,
    }];
  }

  // Title/Chapter 같은 비조문 단위도 근거에서 버리지 않되 조문 행에는 강제 귀속하지 않는다.
  return [{ side, lawCode, articleNo: null, displayRef: cell, rawRef: cell, order }];
}

function parseEvidenceRows(rows: string[][]): EvidenceRow[] {
  const contexts: RefContext[] = LAW_COLUMNS.map(() => ({ articleNo: null, label: '' }));
  return rows.map((cells, rowIndex) => {
    const members = cells.flatMap((cell, col) => membersForCell(cell, LAW_COLUMNS[col], col, contexts[col]));
    return { rowNo: rowIndex + 1, cells, members };
  });
}

function memberKey(m: TransitionMember): string {
  return `${m.side}|${m.lawCode}|${m.articleNo || ''}|${m.displayRef}`;
}

function relationShape(members: TransitionMember[]): RelationShape {
  const current = new Set(members.filter(m => m.side === 'current' && m.articleNo).map(m => `${m.lawCode}|${m.articleNo}`));
  const future = new Set(members.filter(m => m.side === 'future' && m.articleNo).map(m => `${m.lawCode}|${m.articleNo}`));
  if (!current.size && !future.size) return 'unmapped';
  if (!current.size) return 'new';
  if (!future.size) return 'deleted';
  if (current.size === 1 && future.size === 1) return 'one_to_one';
  if (current.size === 1) return 'split';
  if (future.size === 1) return 'merge';
  return 'many_to_many';
}

function combineEvidence(psd3: EvidenceRow[], psr: EvidenceRow[]): SeedGroup[] {
  const count = Math.max(psd3.length, psr.length);
  const result: SeedGroup[] = [];
  for (let i = 0; i < count; i++) {
    const a = psd3[i] || null;
    const b = psr[i] || null;
    const same = !!a && !!b && JSON.stringify(a.cells) === JSON.stringify(b.cells);
    const map = new Map<string, TransitionMember>();
    for (const member of [...(a?.members || []), ...(b?.members || [])]) map.set(memberKey(member), member);
    const members = [...map.values()].sort((x, y) => x.order - y.order || memberKey(x).localeCompare(memberKey(y)));
    const evidence = same ? 'both' : !a ? 'psr_annex' : !b ? 'psd3_annex' : 'conflict';
    const conflictNote = evidence === 'conflict'
      ? `PSD3 Annex III: ${(a?.cells || []).join(' | ')}\nPSR Annex III: ${(b?.cells || []).join(' | ')}`
      : null;
    result.push({
      rowNo: i + 1,
      key: `row-${String(i + 1).padStart(4, '0')}`,
      shape: relationShape(members),
      evidence,
      conflictNote,
      psd3Cells: a?.cells || null,
      psrCells: b?.cells || null,
      members,
    });
  }
  return result.filter(group => group.members.length > 0);
}

function termFrequency(text: string): Map<string, number> {
  const cleaned = String(text || '')
    .toLowerCase()
    .replace(/article\s+\d+(?:\([^)]*\))?/g, ' ')
    .replace(/\b(the|and|or|of|to|a|an|in|for|on|by|with|that|this|as|is|be|shall)\b/g, ' ');
  const map = new Map<string, number>();
  for (const token of cleaned.match(/[a-z][a-z-]{2,}/g) || []) map.set(token, (map.get(token) || 0) + 1);
  return map;
}

function cosineSimilarity(a: string, b: string): number | null {
  const x = termFrequency(a), y = termFrequency(b);
  if (!x.size || !y.size) return null;
  let dot = 0, nx = 0, ny = 0;
  for (const v of x.values()) nx += v * v;
  for (const v of y.values()) ny += v * v;
  for (const [k, v] of x) dot += v * (y.get(k) || 0);
  return dot / (Math.sqrt(nx) * Math.sqrt(ny));
}

function wordCount(text: string): number {
  return (String(text || '').match(/[A-Za-z][A-Za-z-]*/g) || []).length;
}

/** 강화·완화 '후보'를 보수적으로 찾기 위한 의무·제한 표현 빈도. 법적 판단 자체가 아니다. */
function obligationScore(text: string): number {
  const value = String(text || '').toLowerCase();
  const signals = [
    /\bshall\b/g, /\bmust\b/g, /\brequired\b/g, /\bensure\b/g, /\bliab(?:le|ility)\b/g,
    /\bprohibit(?:ed|ion)?\b/g, /\bwithout undue delay\b/g, /\bimmediately\b/g,
    /\bno later than\b/g, /\bmonitor(?:ing)?\b/g, /\breport(?:ing)?\b/g,
  ];
  return signals.reduce((score, re) => score + (value.match(re) || []).length, 0);
}

function sideFor(code: LawCode): Side {
  return code === 'eu_psd2' || code === 'eu_emd2' ? 'current' : 'future';
}

function formatCounterparts(members: TransitionMember[]): string {
  const labels: Record<LawCode, string> = { eu_psd2: 'PSD2', eu_emd2: 'EMD2', eu_psd3: 'PSD3', eu_psr: 'PSR' };
  return [...new Map(members.filter(m => m.articleNo).map(m => [
    `${m.lawCode}|${m.articleNo}`,
    `${labels[m.lawCode]} 제${m.articleNo}조`,
  ])).values()].join(', ');
}

function structuralAssessment(article: ArticleRow, groups: SeedGroup[], textByKey: Map<string, string>): {
  structural: StructuralType;
  change: ChangeType;
  summary: string;
  detail: string;
  similarity: number | null;
} {
  const selectedSide = sideFor(article.code);
  const related = groups.filter(g => g.members.some(m => m.lawCode === article.code && m.articleNo === article.article_no));
  const counterparts = related.flatMap(g => g.members.filter(m => m.side !== selectedSide && m.articleNo));
  const uniqueCounterparts = [...new Map(counterparts.map(m => [`${m.lawCode}|${m.articleNo}`, m])).values()];
  const conflictCount = related.filter(g => g.evidence === 'conflict').length;

  let structural: StructuralType;
  if (!related.length) structural = 'pending';
  else if (!uniqueCounterparts.length) structural = selectedSide === 'current' ? 'deleted' : 'new';
  else if (uniqueCounterparts.length === 1) structural = 'one_to_one';
  else structural = selectedSide === 'current' ? 'split' : 'merge';

  const similarities = uniqueCounterparts
    .map(m => cosineSimilarity(article.text_original, textByKey.get(`${m.lawCode}|${m.articleNo}`) || ''))
    .filter((v): v is number => v != null);
  const similarity = similarities.length ? Math.max(...similarities) : null;

  let change: ChangeType = 'pending';
  if (structural === 'one_to_one' || structural === 'split' || structural === 'merge') {
    if (similarity != null && similarity >= 0.82) {
      change = 'maintained';
    } else if (structural === 'one_to_one' && uniqueCounterparts.length === 1) {
      const counterpartText = textByKey.get(`${uniqueCounterparts[0].lawCode}|${uniqueCounterparts[0].articleNo}`) || '';
      const sourceText = selectedSide === 'current' ? article.text_original : counterpartText;
      const targetText = selectedSide === 'current' ? counterpartText : article.text_original;
      const ratio = wordCount(sourceText) ? wordCount(targetText) / wordCount(sourceText) : 1;
      const obligationDelta = obligationScore(targetText) - obligationScore(sourceText);
      if (similarity != null && similarity >= 0.35 && ratio >= 1.25 && obligationDelta >= 2) change = 'strengthened';
      else if (similarity != null && similarity >= 0.35 && ratio <= 0.70 && obligationDelta <= -2) change = 'relaxed';
      else if (similarity != null && similarity >= 0.60) change = 'clarified';
      else if (similarity != null && similarity < 0.30) change = 'material_change';
    } else if (similarity != null && similarity >= 0.60) change = 'clarified';
    else if (similarity != null && similarity < 0.30) change = 'material_change';
  }

  let summary: string;
  if (structural === 'new') {
    summary = '공식 상관표상 PSD2·EMD2 선행 조문이 없는 신설 규정입니다.';
  } else if (structural === 'deleted') {
    summary = '공식 상관표상 PSD3·PSR 대응 조문이 없어 이행되지 않는 규정입니다.';
  } else if (structural === 'pending') {
    summary = '공식 상관표에서 조문 단위 대응관계를 확인하지 못했습니다.';
  } else {
    const direction = selectedSide === 'current' ? '이행됩니다' : '기존 규정에서 이행됐습니다';
    summary = `${formatCounterparts(uniqueCounterparts)}${selectedSide === 'current' ? '로 ' : '에서 '}${direction}.`;
    if (similarity != null) summary += ` 영문 문언 유사도는 ${Math.round(similarity * 100)}%입니다.`;
  }
  if (conflictCount) summary += ` PSD3·PSR Annex III 간 불일치 ${conflictCount}건이 있어 원문 확인이 필요합니다.`;

  const detail = change === 'maintained'
    ? '영문 원문의 어휘 유사도가 매우 높아 ‘유지’로 자동 분류했습니다. 법적 효과의 동일성은 전문가 검수 전 확정하지 않습니다.'
    : change === 'strengthened'
      ? '대상 조문의 문언량과 의무·제한 표현이 함께 증가해 ‘강화 가능성’ 자동 초안으로 분류했습니다. 적용범위와 예외를 포함한 전문가 검수가 필요합니다.'
      : change === 'relaxed'
        ? '대상 조문의 문언량과 의무·제한 표현이 함께 감소해 ‘완화 가능성’ 자동 초안으로 분류했습니다. 다른 조문으로 의무가 이동했는지 전문가 검수가 필요합니다.'
    : change === 'clarified'
      ? '상당한 문언이 유지되지만 추가·재배열이 있어 ‘명확화’ 자동 초안으로 분류했습니다. 강화·완화 여부는 전문가 검수가 필요합니다.'
      : change === 'material_change'
        ? '대응 조문 사이의 문언 유사도가 낮아 ‘실질변경’ 자동 초안으로 분류했습니다. 분할·통합에 따른 비교 왜곡 가능성이 있습니다.'
        : '내용변경 유형은 아직 검토 중입니다. 공식 상관표는 구조적 대응관계만 제시하며 강화·완화 판단은 포함하지 않습니다.';
  return { structural, change, summary, detail, similarity };
}

async function main(): Promise<void> {
  const migrate = process.argv.includes('--migrate');
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: 'ldb_auth',
    charset: 'utf8mb4',
    multipleStatements: true,
  });

  try {
    if (migrate) {
      const schema = fs.readFileSync(path.join(process.cwd(), 'db', 'foreign_transition.sql'), 'utf8');
      await connection.query(schema);
      console.log('schema: ready');
    }
    await connection.query('SET SESSION group_concat_max_len = 16777216');

    const [annexRows] = await connection.query<any[]>(
      `SELECT l.code, p.text_original
         FROM fin_law_db.law l
         JOIN fin_law_db.law_provision p ON p.law_id=l.id
        WHERE l.code IN ('eu_psd3','eu_psr')
          AND p.article_no='ANNEX III' AND p.seg_kind='other'
        ORDER BY l.code`
    );
    const psd3Text = annexRows.find(r => r.code === 'eu_psd3')?.text_original;
    const psrText = annexRows.find(r => r.code === 'eu_psr')?.text_original;
    if (!psd3Text || !psrText) throw new Error('PSD3/PSR Annex III 상관표를 모두 찾지 못했습니다.');

    const parsedPsd3 = parseEvidenceRows(parseMarkdownTable(psd3Text));
    const parsedPsr = parseEvidenceRows(parseMarkdownTable(psrText));
    if (parsedPsd3.length !== parsedPsr.length) {
      throw new Error(`Annex III 행 수 불일치(PSD3=${parsedPsd3.length}, PSR=${parsedPsr.length}) — 행 정렬 없이 시드하지 않습니다.`);
    }
    const groups = combineEvidence(parsedPsd3, parsedPsr);
    const preflightConflicts = groups.filter(group => group.evidence === 'conflict');
    if (groups.length < 500 || preflightConflicts.length > 20) {
      throw new Error(`Annex III 파싱 품질검사 실패(groups=${groups.length}, conflicts=${preflightConflicts.length})`);
    }

    await connection.beginTransaction();
    await connection.execute(
      `INSERT INTO foreign_transition_version
         (code, label_ko, basis_ko, as_of_date, lifecycle, publish_status, source_urls, notice_ko)
       VALUES (?, ?, ?, ?, 'proposal', 'published', ?, ?)
       ON DUPLICATE KEY UPDATE label_ko=VALUES(label_ko), basis_ko=VALUES(basis_ko),
         as_of_date=VALUES(as_of_date), lifecycle=VALUES(lifecycle),
         source_urls=VALUES(source_urls), notice_ko=VALUES(notice_ko)`,
      [
        VERSION_CODE,
        'EU 결제서비스 패키지 — 집행위원회 2023 제안',
        'COM/2023/366(PSD3) 및 COM/2023/367(PSR)의 Annex III 상관표',
        '2023-06-28',
        JSON.stringify([
          'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:52023PC0366',
          'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:52023PC0367',
        ]),
        '집행위원회 2023 제안 기준이며 미발효·입법 진행 중입니다. 자동 내용분석은 전문가 검수 전 참고용입니다.',
      ]
    );
    const [versionRows] = await connection.execute<any[]>(
      'SELECT id FROM foreign_transition_version WHERE code=? LIMIT 1', [VERSION_CODE]
    );
    const versionId = Number(versionRows[0].id);

    // 공식 구조관계만 재생성한다. 전문가 검토가 끝난 assessment는 아래 UPSERT에서 보존한다.
    await connection.execute('DELETE FROM foreign_transition_group WHERE version_id=?', [versionId]);
    for (const group of groups) {
      const [inserted] = await connection.execute<ResultSetHeader>(
        `INSERT INTO foreign_transition_group
           (version_id, group_key, source_row_no, relation_shape, evidence_status,
            conflict_note, psd3_row_json, psr_row_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          versionId, group.key, group.rowNo, group.shape, group.evidence, group.conflictNote,
          group.psd3Cells ? JSON.stringify(group.psd3Cells) : null,
          group.psrCells ? JSON.stringify(group.psrCells) : null,
        ]
      );
      group.id = Number(inserted.insertId);
      for (const member of group.members) {
        await connection.execute(
          `INSERT IGNORE INTO foreign_transition_member
             (group_id, side, law_code, article_no, display_ref, raw_ref, member_order)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [group.id, member.side, member.lawCode, member.articleNo, member.displayRef, member.rawRef, member.order]
        );
      }
    }

    const [articleRows] = await connection.query<ArticleRow[]>(
      `SELECT l.code, l.abbrev, l.title_ko, p.article_no,
              MAX(NULLIF(p.heading, '')) AS heading,
              MAX(NULLIF(p.heading_ko, '')) AS heading_ko,
              GROUP_CONCAT(COALESCE(p.text_original,'') ORDER BY p.ordinal SEPARATOR '\n') AS text_original
         FROM fin_law_db.law l
         JOIN fin_law_db.law_provision p ON p.law_id=l.id
        WHERE l.code IN ('eu_psd2','eu_emd2','eu_psd3','eu_psr')
          AND p.article_no REGEXP '^[0-9]+$'
        GROUP BY l.code, l.abbrev, l.title_ko, p.article_no
        ORDER BY FIELD(l.code,'eu_psd2','eu_emd2','eu_psd3','eu_psr'), MIN(p.ordinal)`
    );
    const textByKey = new Map(articleRows.map(row => [`${row.code}|${row.article_no}`, row.text_original || '']));
    for (const article of articleRows) {
      const a = structuralAssessment(article, groups, textByKey);
      await connection.execute(
        `INSERT INTO foreign_transition_assessment
           (version_id, law_code, article_no, structural_type, change_type, summary_ko,
            detail_ko, similarity_pct, review_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'automatic')
         ON DUPLICATE KEY UPDATE
           structural_type=VALUES(structural_type),
           similarity_pct=VALUES(similarity_pct),
           change_type=IF(review_status='reviewed', change_type, VALUES(change_type)),
           summary_ko=IF(review_status='reviewed', summary_ko, VALUES(summary_ko)),
           detail_ko=IF(review_status='reviewed', detail_ko, VALUES(detail_ko))`,
        [
          versionId, article.code, article.article_no, a.structural, a.change,
          a.summary, a.detail, a.similarity == null ? null : (a.similarity * 100).toFixed(2),
        ]
      );
    }
    await connection.commit();

    const conflicts = groups.filter(g => g.evidence === 'conflict');
    const stats = groups.reduce<Record<string, number>>((acc, group) => {
      acc[group.shape] = (acc[group.shape] || 0) + 1;
      return acc;
    }, {});
    console.log(`version: ${VERSION_CODE}`);
    console.log(`annex rows: PSD3=${parsedPsd3.length}, PSR=${parsedPsr.length}`);
    console.log(`groups: ${groups.length}, members: ${groups.reduce((n, g) => n + g.members.length, 0)}`);
    console.log(`articles assessed: ${articleRows.length}`);
    console.log(`relation shapes: ${JSON.stringify(stats)}`);
    console.log(`annex conflicts: ${conflicts.length}`);
    for (const conflict of conflicts) console.log(`  ${conflict.key}: ${conflict.conflictNote?.replace(/\n/g, ' <> ')}`);
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
