-- ───────────────────────────────────────────────────────────────────────────
-- 해외법령 조문 '주요 내용' 요약 — 표(요약) 뷰용 (LawQuery 소유)
--   실행(root):  mysql -uroot -p < db/foreign_article_gist.sql
--
--   이행분석(foreign_transition_assessment.summary_ko)은 "무엇이 **바뀌었나**"라서
--   "이 조문이 **무슨 내용인가**"와는 다르다. 요약표 3단(조문명·주요내용·변경사항)의
--   가운데 칸이 여기다.
--
--   키를 (law_code, article_no) 로 두어 이행분석 version 과 무관하게 만든다 —
--   조문 내용 요약은 개정안 버전이 바뀌어도 그 조문의 속성이고, PSD 4법 밖의
--   다른 해외법령(요약표가 필요해지면)에도 그대로 쓸 수 있다.
--
--   원문은 fin_law_db 소유(LawQuery-law ETL)라 건드리지 않는다. 여기는 파생물만.
-- ───────────────────────────────────────────────────────────────────────────
USE ldb_auth;

CREATE TABLE IF NOT EXISTS foreign_article_gist (
  law_code    VARCHAR(48)  NOT NULL COMMENT 'fin_law_db.law.code',
  article_no  VARCHAR(32)  NOT NULL COMMENT '숫자 정규화된 조번호("제73조"→"73")',
  gist_ko     TEXT         DEFAULT NULL COMMENT '조문이 무엇을 정하는지 1~2문장(표 그대로 인용 가능한 문체)',
  source      VARCHAR(32)  NOT NULL DEFAULT 'llm' COMMENT 'llm | manual — 사람이 고치면 manual',
  model       VARCHAR(64)  DEFAULT NULL COMMENT '생성 모델(재생성 이력 추적용)',
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (law_code, article_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='조문 주요내용 요약 — 요약표 뷰 가운데 칸';
-- ★ collation 은 반드시 utf8mb4_unicode_ci — 이 표는 foreign_transition_assessment(unicode_ci)와
--   (law_code, article_no) 로 조인된다. ldb_auth 안에 두 계열이 섞여 있어(메모·즐겨찾기는
--   uca1400_ai_ci) 무심코 DB 기본값을 따르면 조인이 ER_CANT_AGGREGATE_2COLLATIONS 로 깨진다.
