/**
 * PSD 이행분석 '정밀 대사' — 조문 도시에(dossier) 빌더.
 *
 * 공식 Annex III 상관표(_group/_member)로부터 조문 단위 연결요소(클러스터)를 만들고,
 * 각 클러스터에 현행(PSD2·EMD2)·예정(PSD3·PSR) 원문+번역을 실어 워크플로 팬아웃용
 * 스크립트(scratchpad/psd_precise_workflow.mjs)를 생성한다.
 *
 * 클러스터 = 한 에이전트가 통째로 보고 대사 → 현행/예정 양쪽 assessment 를 일관되게 산출.
 *   - 거대 클러스터(transitive megacluster)는 품질을 해치므로 크기 상한으로 쪼갠다.
 *   - 상관표에 대응이 없는 조문(pending)은 단독 dossier(신설/이행없음 판정용).
 *
 * 실행:
 *   npx ts-node scripts/foreign/build_psd_dossiers.ts          # 통계만
 *   npx ts-node scripts/foreign/build_psd_dossiers.ts --emit   # 워크플로 스크립트 생성
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import mysql, { RowDataPacket } from 'mysql2/promise';

dotenv.config({ path: path.join(process.cwd(), '.env') });

/**
 * 대상 버전은 --version 으로 고른다. 2026 잠정합의문 버전은 future 쪽 법 코드가 다르고
 * (eu_psd3_2026·eu_psr_2026) 조번호에 문자접미(110a·45a)가 있어 정렬 기준도 달라진다.
 */
const VERSIONS = {
  eu_psd_commission_2023: {
    laws: ['eu_psd2', 'eu_emd2', 'eu_psd3', 'eu_psr'],
    abbrev: { eu_psd2: 'PSD2', eu_emd2: 'EMD2', eu_psd3: 'PSD3', eu_psr: 'PSR' } as Record<string, string>,
    futureLabel: 'PSD3(지침안 COM/2023/366)·PSR(규정안 COM/2023/367)',
  },
  eu_psd_agreed_2026: {
    laws: ['eu_psd2', 'eu_emd2', 'eu_psd3_2026', 'eu_psr_2026'],
    abbrev: { eu_psd2: 'PSD2', eu_emd2: 'EMD2', eu_psd3_2026: 'PSD3', eu_psr_2026: 'PSR' } as Record<string, string>,
    futureLabel: 'PSD3·PSR 2026 잠정합의문(2026-05-05 ECON 승인, PE787.673·PE787.675)',
  },
} as const;

const versionArg = (() => {
  const i = process.argv.indexOf('--version');
  const v = i >= 0 ? process.argv[i + 1] : 'eu_psd_commission_2023';
  if (!(v in VERSIONS)) throw new Error(`--version 은 ${Object.keys(VERSIONS).join(' | ')} 중 하나`);
  return v as keyof typeof VERSIONS;
})();

const VERSION_CODE = versionArg;
const CONF = VERSIONS[versionArg];
const LAW_ORDER = CONF.laws as readonly string[];
type LawCode = string;
const ABBREV: Record<string, string> = CONF.abbrev;
const isCurrent = (c: LawCode) => c === 'eu_psd2' || c === 'eu_emd2';
/** '110a' 같은 문자접미 조번호를 숫자 우선으로 정렬한다. */
const artKey = (a: string) => {
  const m = /^(\d+)([a-z]*)$/.exec(a);
  return m ? Number(m[1]) * 100 + (m[2] ? m[2].charCodeAt(0) - 96 : 0) : Number.MAX_SAFE_INTEGER;
};
const MAX_CLUSTER_ARTICLES = 8;   // 이보다 큰 연결요소는 현행 조문 기준으로 분해
const MAX_SEG_CHARS = 7000;       // 조 하나가 지나치게 길면 원문/번역 잘라 프롬프트 폭주 방지

const OUT = 'C:/Users/USER/AppData/Local/Temp/claude/C--projects-LawQuery/b86f3455-b454-4c36-a8ce-f1511b2f8b8d/scratchpad';

interface AssessRow extends RowDataPacket { law_code: LawCode; article_no: string; structural_type: string; }
interface MemberRow extends RowDataPacket {
  group_id: number; group_key: string; relation_shape: string; evidence_status: string;
  conflict_note: string | null; source_row_no: number;
  side: 'current' | 'future'; law_code: LawCode; article_no: string | null; display_ref: string;
}
interface SegRow extends RowDataPacket {
  law_code: LawCode; article_no: string; heading: string | null; heading_ko: string | null;
  para_no: string | null; depth: number; text_original: string | null; text_ko: string | null; ordinal: number;
}

interface Seg { para: string; depth: number; en: string; ko: string; }
interface Article {
  key: string; lawCode: LawCode; abbrev: string; articleNo: string; side: 'current' | 'future';
  heading: string; headingKo: string; structural: string; segs: Seg[];
}
interface Evidence { self: string; selfRef: string; shape: string; evidence: string; targets: string; conflict: string | null; }
interface Cluster {
  key: string; label: string;
  current: Article[]; future: Article[];
  evidence: Evidence[];
  articleKeys: string[]; // 이 클러스터가 assessment 를 책임지는 (law|art) 목록
}

const nodeKey = (c: LawCode, a: string) => `${c}|${a}`;

class UnionFind {
  parent = new Map<string, string>();
  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    let cur = x;
    while (this.parent.get(cur) !== root) { const nxt = this.parent.get(cur)!; this.parent.set(cur, root); cur = nxt; }
    return root;
  }
  union(a: string, b: string): void { this.parent.set(this.find(a), this.find(b)); }
}

function clampText(value: string): string {
  const v = String(value || '').replace(/ /g, ' ').trim();
  return v.length > MAX_SEG_CHARS ? v.slice(0, MAX_SEG_CHARS) + ' …(이하 생략)' : v;
}

async function main(): Promise<void> {
  const emit = process.argv.includes('--emit');
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

    const [assess] = await connection.query<AssessRow[]>(
      `SELECT law_code, article_no, structural_type
         FROM foreign_transition_assessment WHERE version_id=?`, [versionId]);
    const assessSet = new Set(assess.map(a => nodeKey(a.law_code, a.article_no)));
    const structuralBy = new Map(assess.map(a => [nodeKey(a.law_code, a.article_no), a.structural_type]));

    const [members] = await connection.query<MemberRow[]>(
      `SELECT g.id AS group_id, g.group_key, g.relation_shape, g.evidence_status,
              g.conflict_note, g.source_row_no,
              m.side, m.law_code, m.article_no, m.display_ref
         FROM foreign_transition_group g
         JOIN foreign_transition_member m ON m.group_id=g.id
        WHERE g.version_id=?
        ORDER BY g.source_row_no, m.side, m.law_code`, [versionId]);

    // 텍스트 로드(fin_law_db) — 조 단위 세그먼트.
    const [segs] = await connection.query<SegRow[]>(
      `SELECT l.code AS law_code, p.article_no, p.heading, p.heading_ko,
              p.para_no, p.depth, p.text_original, p.text_ko, p.ordinal
         FROM fin_law_db.law l
         JOIN fin_law_db.law_provision p ON p.law_id=l.id
        WHERE l.code IN (?)
          AND p.article_no REGEXP '^[0-9]+[a-z]?$'
        ORDER BY l.code, CAST(p.article_no AS UNSIGNED), p.article_no, p.ordinal`,
      [LAW_ORDER as unknown as string[]]);

    const artText = new Map<string, Article>();
    for (const s of segs) {
      const key = nodeKey(s.law_code, s.article_no);
      let art = artText.get(key);
      if (!art) {
        art = {
          key, lawCode: s.law_code, abbrev: ABBREV[s.law_code], articleNo: s.article_no,
          side: isCurrent(s.law_code) ? 'current' : 'future',
          heading: '', headingKo: '', structural: structuralBy.get(key) || 'pending', segs: [],
        };
        artText.set(key, art);
      }
      if (!art.heading && s.heading) art.heading = s.heading;
      if (!art.headingKo && s.heading_ko) art.headingKo = s.heading_ko;
      art.segs.push({
        para: String(s.para_no || '').trim(), depth: Number(s.depth || 0),
        en: String(s.text_original || '').trim(), ko: String(s.text_ko || '').trim(),
      });
    }

    // 1) 연결요소(union-find) — 그룹 안의 numeric 조문 노드끼리 union.
    const uf = new UnionFind();
    const groupInfo = new Map<number, MemberRow>();
    const groupMembers = new Map<number, MemberRow[]>();
    for (const m of members) {
      if (!groupInfo.has(m.group_id)) groupInfo.set(m.group_id, m);
      (groupMembers.get(m.group_id) || groupMembers.set(m.group_id, []).get(m.group_id)!).push(m);
    }
    for (const [, ms] of groupMembers) {
      const nodes = ms.filter(m => m.article_no && /^[0-9]+$/.test(m.article_no)).map(m => nodeKey(m.law_code, m.article_no!));
      for (let i = 1; i < nodes.length; i++) uf.union(nodes[0], nodes[i]);
    }

    // 각 assessment 조문을 컴포넌트로 귀속(그룹에 없으면 단독).
    const comp = new Map<string, string[]>();
    for (const key of assessSet) {
      const root = uf.find(key);
      (comp.get(root) || comp.set(root, []).get(root)!).push(key);
    }

    // 2) 거대 컴포넌트 분해 — 현행 조문 하나 + 그 직접 대응만 남기는 방식으로 상한 적용.
    //    (연결요소가 8조 초과면 통째 대사 대신 현행 조문 기준으로 쪼갬)
    const directCounterparts = new Map<string, Set<string>>(); // key -> 직접 대응 key 들
    for (const [, ms] of groupMembers) {
      const cur = ms.filter(m => m.side === 'current' && m.article_no && /^[0-9]+$/.test(m.article_no));
      const fut = ms.filter(m => m.side === 'future' && m.article_no && /^[0-9]+$/.test(m.article_no));
      for (const a of ms.filter(m => m.article_no && /^[0-9]+$/.test(m.article_no))) {
        const ak = nodeKey(a.law_code, a.article_no!);
        const set = directCounterparts.get(ak) || directCounterparts.set(ak, new Set()).get(ak)!;
        for (const b of (a.side === 'current' ? fut : cur)) set.add(nodeKey(b.law_code, b.article_no!));
      }
    }

    const rawClusters: string[][] = [];
    for (const [, keys] of comp) {
      const arts = keys.filter(k => artText.has(k) || assessSet.has(k));
      if (arts.length <= MAX_CLUSTER_ARTICLES) { rawClusters.push(arts); continue; }
      // 분해: 현행 조문마다 {현행 + 직접대응 future}. 그러고도 남는 future 는 각자 {future + 직접대응 current}.
      const covered = new Set<string>();
      const curKeys = arts.filter(k => isCurrent(k.split('|')[0] as LawCode));
      for (const ck of curKeys) {
        const grp = [ck, ...[...(directCounterparts.get(ck) || [])]];
        rawClusters.push([...new Set(grp)]);
        grp.forEach(g => covered.add(g));
      }
      for (const k of arts) {
        if (covered.has(k)) continue;
        const grp = [k, ...[...(directCounterparts.get(k) || [])]];
        rawClusters.push([...new Set(grp)]);
        grp.forEach(g => covered.add(g));
      }
    }

    // 3) assessment 책임 배정 — 각 assessment 조문은 '자기를 포함하는 가장 작은 클러스터' 1곳에만.
    //    (분해로 한 조문이 여러 클러스터에 들어갈 수 있어 중복 산출 방지)
    const clusters: Cluster[] = [];
    const assignedTo = new Map<string, number>(); // key -> cluster index
    const scored = rawClusters
      .map(keys => [...new Set(keys)])
      .sort((a, b) => a.length - b.length); // 작은 클러스터 우선 배정

    scored.forEach((keys, idx) => {
      const owned: string[] = [];
      for (const k of keys) {
        if (!assessSet.has(k)) continue;
        if (assignedTo.has(k)) continue;
        assignedTo.set(k, idx);
        owned.push(k);
      }
      const currentArts = keys.filter(k => isCurrent(k.split('|')[0] as LawCode)).map(k => artText.get(k)).filter(Boolean) as Article[];
      const futureArts = keys.filter(k => !isCurrent(k.split('|')[0] as LawCode)).map(k => artText.get(k)).filter(Boolean) as Article[];
      const label = [
        ...currentArts.map(a => `${a.abbrev}§${a.articleNo}`),
        '→',
        ...futureArts.map(a => `${a.abbrev}§${a.articleNo}`),
      ].join(' ');
      clusters.push({
        key: `c${String(idx).padStart(3, '0')}`, label: label.slice(0, 80),
        current: sortArts(currentArts), future: sortArts(futureArts),
        evidence: [], articleKeys: owned,
      });
    });

    // assessment 인데 어떤 클러스터도 안 가진 조문(그룹없음/pending) → 단독 클러스터.
    for (const k of assessSet) {
      if (assignedTo.has(k)) continue;
      const art = artText.get(k);
      const isCur = isCurrent(k.split('|')[0] as LawCode);
      const idx = clusters.length;
      clusters.push({
        key: `p${String(idx).padStart(3, '0')}`, label: art ? `${art.abbrev}§${art.articleNo} (대응없음)` : k,
        current: isCur && art ? [art] : [], future: !isCur && art ? [art] : [],
        evidence: [], articleKeys: [k],
      });
      assignedTo.set(k, idx);
    }

    // 4) 각 클러스터 근거(evidence) — 소속 조문이 포함된 그룹의 항·호 대응.
    const clusterByArticle = new Map<string, Cluster>();
    for (const cl of clusters) for (const k of cl.articleKeys) clusterByArticle.set(k, cl);
    for (const [gid, ms] of groupMembers) {
      const gi = groupInfo.get(gid)!;
      for (const m of ms) {
        if (!m.article_no || !/^[0-9]+$/.test(m.article_no)) continue;
        const cl = clusterByArticle.get(nodeKey(m.law_code, m.article_no));
        if (!cl) continue;
        const targets = ms.filter(x => x.side !== m.side && x.display_ref)
          .map(x => `${ABBREV[x.law_code]} ${x.display_ref}`);
        cl.evidence.push({
          self: `${ABBREV[m.law_code]}§${m.article_no}`, selfRef: m.display_ref, shape: gi.relation_shape,
          evidence: gi.evidence_status, targets: [...new Set(targets)].join(', '),
          conflict: gi.evidence_status === 'conflict' ? gi.conflict_note : null,
        });
      }
    }

    // ── 통계 출력 ──
    const sizes = clusters.map(c => c.articleKeys.length);
    const withArt = clusters.filter(c => c.current.length + c.future.length > 0);
    const totalOwned = clusters.reduce((n, c) => n + c.articleKeys.length, 0);
    const dist: Record<number, number> = {};
    for (const c of clusters) { const s = c.current.length + c.future.length; dist[s] = (dist[s] || 0) + 1; }
    console.log(`version_id=${versionId}`);
    console.log(`assessment 조문: ${assessSet.size}, 배정합계: ${totalOwned} (누락 ${assessSet.size - totalOwned})`);
    console.log(`클러스터 수: ${clusters.length} (본문있음 ${withArt.length})`);
    console.log(`클러스터 조문수 분포(현+예 조수: 개수): ${JSON.stringify(Object.fromEntries(Object.entries(dist).sort((a, b) => Number(a[0]) - Number(b[0]))))}`);
    console.log(`최대 조문수 클러스터: ${Math.max(...clusters.map(c => c.current.length + c.future.length))}`);
    const conflicts = clusters.filter(c => c.evidence.some(e => e.conflict));
    console.log(`불일치 evidence 포함 클러스터: ${conflicts.length}`);
    const top = [...clusters].sort((a, b) => (b.current.length + b.future.length) - (a.current.length + a.future.length)).slice(0, 8);
    console.log('상위 클러스터:'); for (const c of top) console.log(`  ${c.key} [${c.current.length + c.future.length}] ${c.label}`);

    // --only-pending: 아직 정밀 대사(analyzed/reviewed) 안 된 조문을 소유한 클러스터만 재시도 워크플로로.
    const onlyPending = process.argv.includes('--only-pending');
    if (onlyPending) {
      const [pend] = await connection.query<RowDataPacket[]>(
        `SELECT law_code, article_no FROM foreign_transition_assessment
          WHERE version_id=? AND review_status NOT IN ('analyzed','reviewed')`, [versionId]);
      const pendSet = new Set(pend.map((r: any) => `${r.law_code}|${r.article_no}`));
      const retry = clusters.filter(c => c.articleKeys.some(k => pendSet.has(k)));
      fs.mkdirSync(OUT, { recursive: true });
      for (const cl of retry) for (const a of [...cl.current, ...cl.future]) {
        for (const s of a.segs) { s.en = clampText(s.en); s.ko = clampText(s.ko); }
      }
      const script = renderWorkflow(retry, 1, 1);
      const p = path.join(OUT, 'psd_precise_retry.mjs');
      fs.writeFileSync(p, script, 'utf8');
      console.log(`\nonly-pending: 미완 조문 ${pendSet.size}개 → 재시도 클러스터 ${retry.length}개 (${(script.length / 1024).toFixed(0)} KB) → ${p}`);
      if (script.length > 512 * 1024) console.warn('  ⚠ 512KB 초과 — 배치 분할 필요');
      return;
    }

    const smoke = process.argv.includes('--smoke');
    if (emit || smoke) {
      fs.mkdirSync(OUT, { recursive: true });
      // 텍스트 캡 적용
      for (const cl of clusters) for (const a of [...cl.current, ...cl.future]) {
        for (const s of a.segs) { s.en = clampText(s.en); s.ko = clampText(s.ko); }
      }
      if (smoke) {
        // 대표 4클러스터: 1:1 실질변경(PSD2§73), 분할/통합(PSD2§97), 신설(PSR§35), 불일치 포함.
        const pick = (k: string) => clusters.find(c => c.articleKeys.includes(k));
        const conflictCl = clusters.find(c => c.evidence.some(e => e.conflict));
        const chosen = [pick('eu_psd2|73'), pick('eu_psd2|97'), pick('eu_psr|35'), conflictCl]
          .filter((c): c is Cluster => !!c)
          .filter((c, i, arr) => arr.findIndex(x => x.key === c.key) === i);
        const script = renderWorkflow(chosen);
        const p = path.join(OUT, 'psd_precise_smoke.mjs');
        fs.writeFileSync(p, script, 'utf8');
        console.log(`\nsmoke: ${p} (${(script.length / 1024).toFixed(0)} KB) — 클러스터: ${chosen.map(c => c.key + ' ' + c.label).join(' | ')}`);
      }
      if (emit) {
        // 워크플로 scriptPath 는 파일당 512KB 상한 → 바이트 예산으로 배치 분할.
        const BUDGET = 360 * 1024; // 클러스터 JSON 누적 데이터 예산(템플릿 여유 포함해도 <512KB)
        const batches: Cluster[][] = [];
        let cur: Cluster[] = [], curBytes = 0;
        for (const cl of clusters) {
          const b = Buffer.byteLength(JSON.stringify(cl), 'utf8');
          if (cur.length && curBytes + b > BUDGET) { batches.push(cur); cur = []; curBytes = 0; }
          cur.push(cl); curBytes += b;
        }
        if (cur.length) batches.push(cur);

        const files: string[] = [];
        batches.forEach((batch, i) => {
          const script = renderWorkflow(batch, i + 1, batches.length);
          const p = path.join(OUT, `psd_precise_b${String(i + 1).padStart(2, '0')}.mjs`);
          fs.writeFileSync(p, script, 'utf8');
          files.push(p);
          console.log(`emit batch ${i + 1}/${batches.length}: ${(script.length / 1024).toFixed(0)} KB, ${batch.length} 클러스터 → ${p}`);
        });
        const metaPath = path.join(OUT, 'psd_clusters_meta.json');
        fs.writeFileSync(metaPath, JSON.stringify({
          versionId, versionCode: VERSION_CODE, batchFiles: files,
          clusters: clusters.map(c => ({ key: c.key, label: c.label, articleKeys: c.articleKeys })),
          assessArticles: [...assessSet],
        }, null, 2), 'utf8');
        console.log(`emit meta: ${metaPath}`);
      }
    }
  } finally {
    await connection.end();
  }
}

function sortArts(arts: Article[]): Article[] {
  return arts.sort((a, b) =>
    LAW_ORDER.indexOf(a.lawCode) - LAW_ORDER.indexOf(b.lawCode) || artKey(a.articleNo) - artKey(b.articleNo));
}

function renderWorkflow(clusters: Cluster[], batchNo = 1, batchTotal = 1): string {
  const data = JSON.stringify(clusters);
  const suffix = batchTotal > 1 ? ` (배치 ${batchNo}/${batchTotal})` : '';
  return `// AUTO-GENERATED by build_psd_dossiers.ts — PSD 정밀 대사 워크플로. 직접 편집 금지.
export const meta = {
  name: 'psd-precise-crosswalk-b${batchNo}',
  description: 'PSD2/EMD2 → PSD3/PSR 조문별 정밀 대사(원문 대조, 러프 유사도 대체)${suffix}',
  phases: [{ title: '정밀 대사', detail: '클러스터별 원문 대조 → 조문별 변경 판정' }],
};

const CLUSTERS = ${data};

const CHANGE_ENUM = ['maintained','clarified','strengthened','relaxed','material_change','pending'];
const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['assessments'],
  properties: { assessments: { type: 'array', items: {
    type: 'object', additionalProperties: false,
    required: ['law_code','article_no','change_type','summary_ko','detail_ko'],
    properties: {
      law_code: { type: 'string', enum: ${JSON.stringify(LAW_ORDER)} },
      article_no: { type: 'string' },
      change_type: { type: 'string', enum: CHANGE_ENUM },
      summary_ko: { type: 'string', maxLength: 1200 },
      detail_ko: { type: 'string', maxLength: 4000 },
    } } } },
};

function renderArticle(a) {
  const segs = a.segs.map(s => {
    const mark = s.para ? '(' + s.para + ') ' : '';
    const ind = '  '.repeat(Math.min(s.depth || 0, 4));
    return ind + mark + 'EN: ' + s.en + (s.ko ? '\\n' + ind + '    KO: ' + s.ko : '');
  }).join('\\n');
  const head = '【' + a.abbrev + ' 제' + a.articleNo + '조' + (a.headingKo ? ' ' + a.headingKo : (a.heading ? ' ' + a.heading : '')) + '】 (구조:' + a.structural + ')';
  return head + '\\n' + (segs || '(본문 없음)');
}

function buildPrompt(cluster) {
  const cur = cluster.current.length ? cluster.current.map(renderArticle).join('\\n\\n') : '(현행 대응 조문 없음 — 예정 규정의 신설 후보)';
  const fut = cluster.future.length ? cluster.future.map(renderArticle).join('\\n\\n') : '(예정 대응 조문 없음 — 현행 규정이 이행되지 않음(삭제/흡수) 후보)';
  const ev = cluster.evidence.length
    ? cluster.evidence.map(e => '- ' + e.self + ' ' + e.selfRef + ' →(' + e.shape + '/' + e.evidence + ') ' + (e.targets || '대응없음') + (e.conflict ? ' [불일치: ' + e.conflict.replace(/\\n/g, ' / ') + ']' : '')).join('\\n')
    : '(항·호 단위 공식 근거 없음)';
  const targets = [...cluster.current, ...cluster.future]
    .filter(a => cluster.articleKeys.includes(a.lawCode + '|' + a.articleNo))
    .map(a => '- law_code="' + a.lawCode + '", article_no="' + a.articleNo + '"  (' + a.abbrev + ' 제' + a.articleNo + '조)').join('\\n');

  return [
'당신은 EU 결제법제 전문 법률 애널리스트다. 현행 PSD2(지침 2015/2366)·EMD2(전자화폐지침 2009/110/EC) 가',
'${CONF.futureLabel} 로 어떻게 이행되는지를,',
'아래 원문(EN=권위 있는 정본, KO=참고 번역)을 직접 대조해 "실제로 무엇이 바뀌었는지" 정밀 판정하라.',
'EMD2 의 전자화폐 규율은 PSD3/PSR 로 통합(흡수)된다는 큰 그림을 전제로 한다.',
'',
'[현행 규정 — PSD2/EMD2]',
cur,
'',
'[예정 규정 — PSD3/PSR]',
fut,
'',
'[공식 Annex III 상관표 근거(항·호 단위)]',
ev,
'',
'[판정 규칙]',
'• 반드시 KO(번역) 가 아니라 EN(정본) 을 근거로 판단하라. KO 에는 조번호 분해 같은 번역 오류가 있을 수 있다(예: "제5조 4항" 은 실제 "제54조").',
'• 어휘 유사도(몇 % 겹침)로 판단하지 말라. 의무·요건·기한·범위·책임의 실질 변화를 본다.',
'• change_type 은 다음 중 하나:',
'   - maintained(유지): 실질 동일, 문구·조번호 정리 수준.',
'   - clarified(명확화): 실질 동일하되 정의·절차가 구체화/명료화, 새 의무는 없음.',
'   - strengthened(강화): 새·확대 의무, 더 엄격한 기준·짧은 기한, 넓어진 적용범위, 새 책임/소비자보호.',
'   - relaxed(완화): 의무 축소·삭제, 예외 신설, 기한 연장, 범위 축소.',
'   - material_change(실질변경): 메커니즘 교체·책임 재배분·개념 재설계처럼 강화/완화로 단순화 못 할 구조적 변화.',
'   - pending: 정말로 판단 불가할 때만.',
'• 신설(현행 대응 없음): 도입된 규율 내용을 서술하고, 효과로 유형 선택(새 의무→strengthened, 부담 줄이는 새 권리/예외→relaxed, 새 정의/절차→clarified, 기존 EBA 지침 등 성문화→maintained/clarified).',
'• 이행없음(예정 대응 없음): 요건이 폐지/이동/흡수 중 무엇인지 밝히고, 의무 폐지면 relaxed, 이동·재편이면 material_change.',
'',
'[작성 지침]',
'• summary_ko: 1~2문장. 대응 조문과 핵심 변화를 구체적으로. "유사도 X%" 같은 표현 금지.',
'• detail_ko: 2~5문장. 항 단위로 구체적 변화를 적시(예: "PSR 제56조(2) 신설: 사기의심 시 10영업일 내 환불 또는 거부사유·불복기관 고지 의무"). 실무 영향, 불일치·불확실이 있으면 명시.',
'• 모든 문장은 한국어. 상투적 면책문구("전문가 검수 필요" 등) 로 채우지 말 것.',
'',
'[출력 대상] — 아래 조문 각각에 대해 assessments 배열 항목을 정확히 하나씩 낸다(누락·중복 금지).',
'  ★ article_no 는 반드시 아래 표기의 숫자만 쓴다(예: "73"). "제73조"·"73조" 처럼 쓰지 말 것. law_code 도 그대로 복사.',
targets,
  ].join('\\n');
}

phase('정밀 대사');
const results = await pipeline(
  CLUSTERS,
  (c) => agent(buildPrompt(c), { label: c.label || c.key, phase: '정밀 대사', schema: SCHEMA })
);
const flat = results.filter(Boolean).flatMap(r => (r && r.assessments) || []);
return { clusters: CLUSTERS.length, ok: results.filter(Boolean).length, assessments: flat.length };
`;
}

main().catch(error => { console.error(error instanceof Error ? error.stack : error); process.exit(1); });
