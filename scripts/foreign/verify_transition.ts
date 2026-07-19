/**
 * PSD 이행분석 백엔드 모델 검증 — getCatalog/getThemes/getAnalysis 를 실제 호출해
 * 프론트가 받게 될 데이터 형상을 점검한다(HTTP·인증 없이 모델 계층만).
 *
 * 실행: npx ts-node scripts/foreign/verify_transition.ts
 */
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(process.cwd(), '.env') });

import { PsdTransitionModel } from '../../src/backend/ts/foreign-transition/models/PsdTransitionModel';
import DbContext from '../../src/backend/ts/common/DbContext';

async function main(): Promise<void> {
  const model = new PsdTransitionModel();

  const catalog = await model.getCatalog();
  console.log('=== catalog ===');
  console.log('themeCount:', catalog?.themeCount, '| conflictCount:', catalog?.conflictCount);
  for (const l of catalog?.laws || []) {
    console.log(`  ${l.abbrev}: ${l.articleCount}조 / 이행 ${l.mappedCount} / 신설 ${l.newCount} / 이행없음 ${l.deletedCount} / 검수 ${l.reviewedCount}`);
  }

  const themes = await model.getThemes();
  console.log('\n=== themes ===', themes?.themes.length, '건');
  for (const t of (themes?.themes || []).slice(0, 3)) {
    console.log(`  [${t.categoryKo}] (${t.impact}) ${t.titleKo}`);
    console.log(`     현행:${t.currentRefKo} → 변경:${t.futureRefKo} | 링크 ${t.articleLinks.length}개`);
    console.log(`     요약: ${t.summaryKo.slice(0, 70)}…`);
  }

  const analysis = await model.getAnalysis('eu_psr');
  console.log('\n=== getAnalysis(eu_psr) ===', analysis?.articles.length, '조');
  const a56 = analysis?.articles.find(x => x.articleNo === '56');
  if (a56) {
    console.log('  PSR 제56조:', a56.assessment.structuralType, '/', a56.assessment.changeType, '/', a56.assessment.reviewStatus);
    console.log('   요약:', a56.assessment.summaryKo.slice(0, 90), '…');
    console.log('   대응:', a56.relations.flatMap(r => r.counterparts.map(c => `${c.abbrev}§${c.articleNo}`)).join(', '));
  }
  const statusDist = (analysis?.articles || []).reduce<Record<string, number>>((acc, x) => {
    acc[x.assessment.reviewStatus] = (acc[x.assessment.reviewStatus] || 0) + 1; return acc;
  }, {});
  console.log('  PSR reviewStatus 분포:', JSON.stringify(statusDist));

  await DbContext.getInstance('fin_law_db').end().catch(() => undefined);
  await DbContext.getInstance(process.env.AUTH_DB || 'ldb_auth').end().catch(() => undefined);
}

main().catch(e => { console.error(e instanceof Error ? e.stack : e); process.exit(1); });
