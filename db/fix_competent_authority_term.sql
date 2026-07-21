-- ───────────────────────────────────────────────────────────────────────────
-- 용어 통일: competent authority/authorities → 관할 당국/기관
--   실행:  mysql -uroot -p < db/fix_competent_authority_term.sql   (dev·prod 공통, 멱등)
--
--   competent authorities 를 '권한 있는 당국'으로 번역해 '관할 당국'과 혼재했다. '관할'로 통일.
--
--   ★ '권한 있는' 은 competent 뿐 아니라 **authorized** 도 번역한다:
--       권한 있는 인물/직원/사람 = authorized person/officer  (← 건드리면 안 됨)
--       권한 있는 기관         = authorized institution(hk_amlo) 또는 competent authority(EU)
--     그래서 무차별 '권한 있는'→'관할' 치환은 금지. 아래처럼 좁혀서만 바꾼다:
--       · '권한 있는 당국'  → 원문에 competent 있는 행만 (당국=authorities 라 거의 안전, 가드로 확정)
--       · '권한 있는 기관'  → EU 법령 + 원문 competent authority + authorized institution/body 아님
-- ───────────────────────────────────────────────────────────────────────────

-- ① 해외법령 원문 번역(fin_law_db) — '당국'형: competent 원문 가드
UPDATE fin_law_db.law_provision
   SET text_ko = REPLACE(text_ko, '권한 있는 당국', '관할 당국')
 WHERE text_ko LIKE '%권한 있는 당국%'
   AND LOWER(text_original) LIKE '%competent%';

-- ② 해외법령 원문 번역(fin_law_db) — '기관'형: EU + competent authority + authorized institution/body 제외
UPDATE fin_law_db.law l
   JOIN fin_law_db.law_provision p ON p.law_id = l.id
    SET p.text_ko = REPLACE(p.text_ko, '권한 있는 기관', '관할 기관')
  WHERE l.code LIKE 'eu_%'
    AND p.text_ko LIKE '%권한 있는 기관%'
    AND LOWER(p.text_original) LIKE '%competent authorit%'
    AND LOWER(p.text_original) NOT LIKE '%authori_ed institution%'
    AND LOWER(p.text_original) NOT LIKE '%authori_ed body%';

-- ③ 이행분석 파생물(ldb_auth) — 전부 PSD 결제분석 맥락이라 authorized institution 개념 없음 → 직접 치환
UPDATE ldb_auth.foreign_article_gist
   SET gist_ko = REPLACE(REPLACE(gist_ko, '권한 있는 당국', '관할 당국'), '권한 있는 기관', '관할 기관')
 WHERE gist_ko LIKE '%권한 있는 당국%' OR gist_ko LIKE '%권한 있는 기관%';

UPDATE ldb_auth.foreign_transition_assessment
   SET summary_ko = REPLACE(REPLACE(summary_ko, '권한 있는 당국', '관할 당국'), '권한 있는 기관', '관할 기관'),
       detail_ko  = REPLACE(REPLACE(detail_ko,  '권한 있는 당국', '관할 당국'), '권한 있는 기관', '관할 기관')
 WHERE summary_ko LIKE '%권한 있는 당국%' OR summary_ko LIKE '%권한 있는 기관%'
    OR detail_ko  LIKE '%권한 있는 당국%' OR detail_ko  LIKE '%권한 있는 기관%';

UPDATE ldb_auth.foreign_transition_theme
   SET title_ko      = REPLACE(REPLACE(title_ko,      '권한 있는 당국', '관할 당국'), '권한 있는 기관', '관할 기관'),
       summary_ko    = REPLACE(REPLACE(summary_ko,    '권한 있는 당국', '관할 당국'), '권한 있는 기관', '관할 기관'),
       detail_ko     = REPLACE(REPLACE(detail_ko,     '권한 있는 당국', '관할 당국'), '권한 있는 기관', '관할 기관'),
       current_ref_ko= REPLACE(REPLACE(current_ref_ko,'권한 있는 당국', '관할 당국'), '권한 있는 기관', '관할 기관'),
       future_ref_ko = REPLACE(REPLACE(future_ref_ko, '권한 있는 당국', '관할 당국'), '권한 있는 기관', '관할 기관')
 WHERE CONCAT_WS(' ', title_ko, summary_ko, detail_ko, current_ref_ko, future_ref_ko) LIKE '%권한 있는 당국%'
    OR CONCAT_WS(' ', title_ko, summary_ko, detail_ko, current_ref_ko, future_ref_ko) LIKE '%권한 있는 기관%';
