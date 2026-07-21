/**
 * 2026 잠정합의문 기준 이행분석 버전 생성 + 공식 상관표(Annex III) 복제.
 *
 * 배경
 *   최종 목적은 "PSD2/EMD2 가 어떻게 되는가"이고, 2023 초안을 거치면 오차만 쌓인다.
 *   그래서 PSD2/EMD2 → **2026 합의문** 을 직접 대사한다(별도 버전 eu_psd_agreed_2026).
 *
 *   공식 상관표(foreign_transition_group/member)는 PSD2/EMD2 → PSD3/PSR **조번호** 매핑인데,
 *   2026 이 2023 의 조번호 체계를 거의 그대로 유지했다(실측: 미래측 조문 531개 중 529개가 2026 에도
 *   동일 번호로 존재, 소멸은 PSD3 제20조·PSR 제105조 2건뿐). 따라서 상관표 뼈대를 재사용하고
 *   미래측 law_code 만 eu_psd3→eu_psd3_2026, eu_psr→eu_psr_2026 으로 바꿔 복제한다.
 *   현행측(PSD2·EMD2)은 그대로. 대사 '내용'은 워크플로가 2026 원문으로 이미 새로 산출했다.
 *
 * 이 스크립트는 **구조(상관표)만** 만든다. 대사 결과(assessment)는 apply_psd_precise.ts
 *   --version eu_psd_agreed_2026 이 별도로 적재한다.
 *
 * 실행
 *   npx ts-node scripts/foreign/seed_transition_2026.ts --dry   # 통계만
 *   npx ts-node scripts/foreign/seed_transition_2026.ts         # 커밋
 */
import path from 'path';
import dotenv from 'dotenv';
import mysql, { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const SRC_VERSION = 'eu_psd_commission_2023';
const NEW_VERSION = 'eu_psd_agreed_2026';
// 미래측 law_code 치환(현행측은 그대로 둔다).
const REMAP: Record<string, string> = { eu_psd3: 'eu_psd3_2026', eu_psr: 'eu_psr_2026' };

async function main() {
  const dry = process.argv.includes('--dry');
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'genius',
    database: 'ldb_auth', charset: 'utf8mb4', multipleStatements: false,
  });

  try {
    const [[src]] = await conn.query<RowDataPacket[]>(
      'SELECT * FROM foreign_transition_version WHERE code=?', [SRC_VERSION]);
    if (!src) throw new Error(`원본 버전 ${SRC_VERSION} 이 없습니다`);

    // ── 1) 새 버전 upsert ────────────────────────────────────────────────
    const label = 'EU 결제서비스 패키지 — 2026 잠정합의문';
    const basis = 'PSD3(PE787.673)·PSR(PE787.675) 2026-05-05 ECON 승인문 + Annex III 상관표(조번호 유지)';
    const notice = '2026-05-05 잠정합의문 기준입니다. 정식 채택·관보 게재 전 문안이므로 현행법으로 인용할 수 없습니다. '
      + '대응관계는 2023 제안본의 공식 상관표를 따르며(조번호 유지 확인), 조문별 분석은 PSD2·EMD2 원문과 '
      + '2026 합의문을 대조한 정밀 분석입니다.';
    const sources = JSON.stringify([
      'https://www.europarl.europa.eu/RegData/commissions/econ/inag/2026/05-05/ECON_AG(2026)787673_EN.pdf',
      'https://www.europarl.europa.eu/RegData/commissions/econ/inag/2026/05-05/ECON_AG(2026)787675_EN.pdf',
    ]);

    const [[existing]] = await conn.query<RowDataPacket[]>(
      'SELECT id FROM foreign_transition_version WHERE code=?', [NEW_VERSION]);
    let newVid: number;
    if (existing) {
      newVid = existing.id;
      if (!dry) {
        // 재실행 안전: 기존 그룹(member CASCADE)만 비우고 재삽입. assessment 는 건드리지 않는다.
        await conn.execute('DELETE FROM foreign_transition_group WHERE version_id=?', [newVid]);
        await conn.execute(
          `UPDATE foreign_transition_version SET label_ko=?, basis_ko=?, as_of_date='2026-05-05',
                  lifecycle='proposal', publish_status='published', source_urls=?, notice_ko=? WHERE id=?`,
          [label, basis, sources, notice, newVid]);
      }
      console.log(`기존 버전 재사용(id=${newVid}) — 그룹 재생성`);
    } else {
      if (dry) { console.log('[dry] 새 버전 생성 예정'); newVid = -1; }
      else {
        const [r] = await conn.execute<ResultSetHeader>(
          `INSERT INTO foreign_transition_version
             (code, label_ko, basis_ko, as_of_date, lifecycle, publish_status, source_urls, notice_ko)
           VALUES (?,?,?,?,'proposal','published',?,?)`,
          [NEW_VERSION, label, basis, '2026-05-05', sources, notice]);
        newVid = r.insertId;
        console.log(`새 버전 생성 id=${newVid}`);
      }
    }

    // ── 2) 상관표(group + member) 복제 ───────────────────────────────────
    const [groups] = await conn.query<RowDataPacket[]>(
      'SELECT * FROM foreign_transition_group WHERE version_id=? ORDER BY id', [src.id]);
    let gCnt = 0, mCnt = 0, remapCnt = 0;
    for (const g of groups) {
      const [members] = await conn.query<RowDataPacket[]>(
        'SELECT * FROM foreign_transition_member WHERE group_id=? ORDER BY id', [g.id]);
      if (dry) {
        gCnt++;
        for (const m of members) if (m.side === 'future' && REMAP[m.law_code]) remapCnt++;
        mCnt += members.length;
        continue;
      }
      const [gr] = await conn.execute<ResultSetHeader>(
        `INSERT INTO foreign_transition_group
           (version_id, group_key, relation_shape, evidence_status, conflict_note, source_row_no,
            psd3_row_json, psr_row_json)
         VALUES (?,?,?,?,?,?,?,?)`,
        [newVid, g.group_key, g.relation_shape, g.evidence_status, g.conflict_note, g.source_row_no,
         g.psd3_row_json, g.psr_row_json]);
      const newGid = gr.insertId; gCnt++;
      for (const m of members) {
        const law = m.side === 'future' ? (REMAP[m.law_code] || m.law_code) : m.law_code;
        if (m.side === 'future' && REMAP[m.law_code]) remapCnt++;
        await conn.execute(
          `INSERT INTO foreign_transition_member
             (group_id, side, law_code, article_no, display_ref, raw_ref, member_order)
           VALUES (?,?,?,?,?,?,?)`,
          [newGid, m.side, law, m.article_no, m.display_ref, m.raw_ref, m.member_order]);
        mCnt++;
      }
    }

    console.log(`상관표 복제: 그룹 ${gCnt} · member ${mCnt}(미래측 law_code 치환 ${remapCnt})`);

    // ── 4) assessment 의 structural_type 유도 ────────────────────────────────
    //   apply_psd_precise 는 change_type(내용)만 채운다. 구조유형(어느 조가 어느 조로)은
    //   상관표에서 유도해야 하는데, 그 단계가 없어 매핑이 있는 조문도 'pending'(검토중)으로
    //   남던 버그를 여기서 잡는다. 2023 시더(seed_psd_transition)와 같은 규칙:
    //     그룹 없음 → 미래측은 신설(new)·현행측은 검토중(pending)
    //     그룹 있고 대응 없음 → 현행측 이행없음(deleted)·미래측 신설(new)
    //     대응 1개 → one_to_one / 대응 여러개 → 현행측 split·미래측 merge
    //   검수완료(reviewed)行은 손대지 않는다(사람 판단 보존).
    const CURRENT = new Set(['eu_psd2', 'eu_emd2']);
    const [members] = await conn.query<RowDataPacket[]>(
      `SELECT group_id, side, law_code, article_no FROM foreign_transition_member
        WHERE group_id IN (SELECT id FROM foreign_transition_group WHERE version_id=?)`, [newVid]);
    const byGroup = new Map<number, RowDataPacket[]>();
    for (const m of members) (byGroup.get(m.group_id) || byGroup.set(m.group_id, []).get(m.group_id)!).push(m);

    const [assessments] = await conn.query<RowDataPacket[]>(
      `SELECT law_code, article_no, structural_type, review_status
         FROM foreign_transition_assessment WHERE version_id=?`, [newVid]);

    const deriveStructural = (lawCode: string, articleNo: string): string => {
      const side = CURRENT.has(lawCode) ? 'current' : 'future';
      const related = [...byGroup.values()].filter(ms =>
        ms.some(m => m.law_code === lawCode && m.article_no === articleNo));
      if (!related.length) return side === 'future' ? 'new' : 'pending';
      const counterparts = new Set(
        related.flatMap(ms => ms.filter(m => m.side !== side && m.article_no)
          .map(m => `${m.law_code}|${m.article_no}`)));
      if (!counterparts.size) return side === 'current' ? 'deleted' : 'new';
      if (counterparts.size === 1) return 'one_to_one';
      return side === 'current' ? 'split' : 'merge';
    };

    // ★ 'pending'(검토중) 행만 보정한다. 이미 설정된 구조유형(one_to_one·many_to_many·split·merge…)은
    //   원본 파이프라인(그룹 relation_shape 기반)이 다중 그룹 소속까지 반영해 넣은 값이라
    //   단순 재유도로 덮으면 정보가 준다. pending 은 '미결'이므로 채워 넣는 것만 안전하다.
    let fixed = 0;
    const changes: Record<string, number> = {};
    for (const a of assessments) {
      if (a.review_status === 'reviewed' || a.structural_type !== 'pending') continue;
      const next = deriveStructural(a.law_code, a.article_no);
      if (next === a.structural_type) continue;
      changes[`${a.structural_type}→${next}`] = (changes[`${a.structural_type}→${next}`] || 0) + 1;
      fixed++;
      if (!dry) {
        await conn.execute(
          `UPDATE foreign_transition_assessment SET structural_type=?
            WHERE version_id=? AND law_code=? AND article_no=? AND review_status<>'reviewed'`,
          [next, newVid, a.law_code, a.article_no]);
      }
    }
    console.log(`구조유형 유도: ${fixed}건 보정`, changes);
    if (dry) console.log('--dry: 커밋 없이 종료');
  } finally {
    await conn.end();
  }
}

main().catch(e => { console.error(e instanceof Error ? e.stack : e); process.exit(1); });
