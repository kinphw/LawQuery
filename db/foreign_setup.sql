-- ───────────────────────────────────────────────────────────────────────────
-- 해외법령 조회 확장 — DB 권한 + 개인 메모(5단) 테이블
--   실행(root):  mysql -uroot -p < db/foreign_setup.sql
--
--   데이터 본체는 sentinel 소유 fin_law_db(law / law_provision)를 단일 소스로 사용한다.
--   LawQuery 런타임 계정(ldbuser)에 읽기 권한만 부여하고, 개인 메모만 회원 DB(ldb_auth)에 둔다.
-- ───────────────────────────────────────────────────────────────────────────

-- 1) LawQuery 런타임 계정(ldbuser)에 해외법령 DB 읽기 권한 부여
GRANT SELECT ON fin_law_db.* TO 'ldbuser'@'localhost';
FLUSH PRIVILEGES;

-- 2) 해외법령 개인 메모 — 회원 DB(ldb_auth)에 둔다(member FK).
--    조회는 조문(article) 단위이므로 메모 키는 그 article의 대표 provision_id(fin_law_db).
USE ldb_auth;
CREATE TABLE IF NOT EXISTS foreign_memo (
  id            BIGINT       NOT NULL AUTO_INCREMENT,
  member_id     BIGINT       NOT NULL,
  provision_id  BIGINT       NOT NULL  COMMENT 'fin_law_db.law_provision.id (article 대표, cross-DB 논리참조)',
  law_code      VARCHAR(48)  NOT NULL  COMMENT 'fin_law_db.law.code (조회 편의)',
  memo          MEDIUMTEXT   NOT NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_member_provision (member_id, provision_id),
  KEY idx_member_law (member_id, law_code),
  CONSTRAINT fk_foreign_memo_member FOREIGN KEY (member_id)
    REFERENCES member (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- ANNEX 분리·표 복원·재번역(scripts/foreign/fill_struct.py)은 fin_law_db.law_provision 에 직접 반영한다
-- (별도 보조 테이블 없음). ANNEX 는 article_no='ANNEX I'… 새 행으로 INSERT, 표는 text 에 마크다운으로 저장.
