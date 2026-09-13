-- ───────────────────────────────────────────────────────────────────────────
-- 용어 교정: direct debit 오역 '직불' → '출금이체'
--   실행:  mysql -uroot -p < db/fix_direct_debit_term.sql   (dev·prod 공통, 멱등)
--
--   direct debit = 지급인 계좌에서 차기(借記)되는 이체 → 출금이체(추심이체).
--   (credit transfer = 수취인 계좌에 대기(貸記) → 입금이체. 정반대다 — fix_credit_transfer_term.sql)
--   SEPA규정(eu_sepa)·즉시결제규정(eu_ipr) 적재로 코퍼스에 direct debit 이 처음 들어오면서
--   기계번역이 '직불'로만 옮겨 카드결제의 '직불(debit card)'과 구분이 안 되는 문제가 생겼다.
--
--   ★ 무차별 '직불'→'출금이체' 치환은 금지. 코퍼스의 '직불' 366행 중 330행이 direct debit 이
--     아니라 **직불카드(debit card)**·직불 수단(debit instrument, us_efta)이다.
--     ① 원문에 'direct debit' 이 있는 행만, ② 그 행 안에서도 '직불카드'·'직불 카드'는 보호한다.
-- ───────────────────────────────────────────────────────────────────────────

-- ① 해외법령 원문 번역(fin_law_db) — direct debit 원문 가드 + 카드 표기 보호
UPDATE fin_law_db.law_provision
   SET text_ko = REPLACE(REPLACE(REPLACE(
       REPLACE(REPLACE(text_ko, '직불카드', '@@DBCARD1@@'), '직불 카드', '@@DBCARD2@@'),
       '직불', '출금이체'),
       '@@DBCARD1@@', '직불카드'), '@@DBCARD2@@', '직불 카드')
 WHERE text_ko LIKE '%직불%'
   AND LOWER(text_original) LIKE '%direct debit%';

-- ② 조 제목 번역(heading_ko) — 같은 원문 가드
UPDATE fin_law_db.law_provision
   SET heading_ko = REPLACE(REPLACE(REPLACE(
       REPLACE(REPLACE(heading_ko, '직불카드', '@@DBCARD1@@'), '직불 카드', '@@DBCARD2@@'),
       '직불', '출금이체'),
       '@@DBCARD1@@', '직불카드'), '@@DBCARD2@@', '직불 카드')
 WHERE heading_ko LIKE '%직불%'
   AND LOWER(heading) LIKE '%direct debit%';
