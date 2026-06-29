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

-- 1-b) 조 제목 한국어 컬럼(목차·바로가기용). 값은 scripts/foreign/fill_heading.py 로 적재.
ALTER TABLE fin_law_db.law_provision ADD COLUMN IF NOT EXISTS heading_ko VARCHAR(512) DEFAULT NULL;

-- 2) 해외법령 개인 메모 — 회원 DB(ldb_auth)에 둔다(member FK).
--    seg-level 적재(STN)에 맞춰 메모 키 = 안정 논리키 (law_code, article_no, seg_index).
--    seg_index = article 내 1-based 순위 → 재적재(물리 id 변경)에도 메모 보존.
--    (구 provision_id 키에서 전환: 기존 메모 0건이라 DROP+재생성.)
USE ldb_auth;
DROP TABLE IF EXISTS foreign_memo;
CREATE TABLE foreign_memo (
  id            BIGINT       NOT NULL AUTO_INCREMENT,
  member_id     BIGINT       NOT NULL,
  law_code      VARCHAR(48)  NOT NULL  COMMENT 'fin_law_db.law.code',
  article_no    VARCHAR(32)  NOT NULL  COMMENT 'fin_law_db 조/ANNEX 묶음 키',
  seg_index     INT          NOT NULL  COMMENT 'article 내 1-based seg 순위(안정 앵커)',
  memo          MEDIUMTEXT   NOT NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_member_seg (member_id, law_code, article_no, seg_index),
  KEY idx_member_law (member_id, law_code),
  CONSTRAINT fk_foreign_memo_member FOREIGN KEY (member_id)
    REFERENCES member (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- ANNEX 분리·표 markdown 생성은 STN(sentinel ETL)이 적재 시 직접 수행(LQ fill_struct 폐기).
-- LQ 는 fin_law_db 를 read-only 소비 + 번역(text_ko/heading_ko)만 채운다.
