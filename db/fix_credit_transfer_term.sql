-- ───────────────────────────────────────────────────────────────────────────
-- 용어 교정: credit transfer 오역 '신용 이체' → '입금이체'
--   실행:  mysql -uroot -p < db/fix_credit_transfer_term.sql   (dev·prod 공통, 멱등)
--
--   credit transfer = 수취인 계정에 대기(貸記)되는 이체 → 입금이체.
--   (direct debit = 지급인 계정에서 차기(借記) → 출금이체·추심이체. 정반대다.)
--   기존 기계번역이 credit 을 '신용'으로 직역해 '신용 이체'로 오역했다.
--
--   ★ fin_law_db 는 **원문에 실제 'credit transfer' 가 있는 행만** 바꾼다.
--     us_fincen1022("transfers of credit"=신용의 이체)·us_reg_e("credit feature"=신용 기능)
--     처럼 credit 이 다른 뜻인 행이 섞여 있어, 가드 없이 치환하면 오염된다.
--   ldb_auth 파생물(gist·assessment·theme)은 전부 PSD 결제 분석 맥락이라 직접 치환.
-- ───────────────────────────────────────────────────────────────────────────

-- ① 해외법령 원문 번역(fin_law_db) — credit transfer 원문 가드
UPDATE fin_law_db.law_provision
   SET text_ko = REPLACE(text_ko, '신용 이체', '입금이체')
 WHERE text_ko LIKE '%신용 이체%'
   AND LOWER(text_original) LIKE '%credit transfer%';

-- ② 조문 주요내용(gist)
UPDATE ldb_auth.foreign_article_gist
   SET gist_ko = REPLACE(gist_ko, '신용 이체', '입금이체')
 WHERE gist_ko LIKE '%신용 이체%';

-- ③ 이행분석 조문별 대사
UPDATE ldb_auth.foreign_transition_assessment
   SET summary_ko = REPLACE(summary_ko, '신용 이체', '입금이체'),
       detail_ko  = REPLACE(detail_ko,  '신용 이체', '입금이체')
 WHERE summary_ko LIKE '%신용 이체%' OR detail_ko LIKE '%신용 이체%';

-- ④ 이행분석 요약 테마
UPDATE ldb_auth.foreign_transition_theme
   SET title_ko      = REPLACE(title_ko,      '신용 이체', '입금이체'),
       summary_ko    = REPLACE(summary_ko,    '신용 이체', '입금이체'),
       detail_ko     = REPLACE(detail_ko,     '신용 이체', '입금이체'),
       current_ref_ko= REPLACE(current_ref_ko,'신용 이체', '입금이체'),
       future_ref_ko = REPLACE(future_ref_ko, '신용 이체', '입금이체')
 WHERE CONCAT_WS(' ', title_ko, summary_ko, detail_ko, current_ref_ko, future_ref_ko) LIKE '%신용 이체%';
