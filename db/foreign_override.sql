-- ───────────────────────────────────────────────────────────────────────────
-- 해외법령 본문 교정 레이어(override) — 운영에서도 안전하게 오탈자 교정
--
--   원리(메모와 동일 패턴): 원본(fin_law_db.law_provision)은 STN·번역스크립트가 관리하는
--   불변 베이스로 두고, 사람이 고친 교정은 여기(ldb_auth, 별도 DB)에 논리키로 저장한다.
--   조회 시 베이스 위에 교정을 덮어 보여준다.
--     · 이관(replicate)은 fin_law_db 만 건드리므로 교정은 절대 유실되지 않는다.
--     · 되돌리기 = 해당 행 삭제(= 원본 복귀). 원문 훼손 없음.
--     · 환경(dev/prod)별로 각각 보관(메모와 동일). 운영 교정은 운영에 남는다.
--
--   적용:  mysql -uroot -p < db/foreign_override.sql   (dev·prod 각 1회)
--   런타임(ldbuser)은 ldb_auth 쓰기 권한이 이미 있어(메모와 동일) 추가 GRANT 불필요.
-- ───────────────────────────────────────────────────────────────────────────

USE ldb_auth;
CREATE TABLE IF NOT EXISTS foreign_override (
  id            BIGINT       NOT NULL AUTO_INCREMENT,
  law_code      VARCHAR(48)  NOT NULL  COMMENT 'fin_law_db.law.code',
  article_no    VARCHAR(32)  NOT NULL  COMMENT 'fin_law_db 조/ANNEX 묶음 키',
  seg_index     INT          NOT NULL  COMMENT 'article 내 1-based seg 순위(안정 앵커)',
  field         VARCHAR(16)  NOT NULL  COMMENT '교정 대상 컬럼(text_original/text_ko/heading/heading_ko)',
  value         MEDIUMTEXT   NOT NULL  COMMENT '교정본(베이스를 덮어씀)',
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_override (law_code, article_no, seg_index, field),
  KEY idx_law (law_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
