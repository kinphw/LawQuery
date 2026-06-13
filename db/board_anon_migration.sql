-- 건의사항 게시판: 비로그인(비회원) 작성 허용 마이그레이션
-- 적용:  mysql -u ldbuser -p ldb_auth < db/board_anon_migration.sql
-- 재실행 안전(MODIFY는 멱등, ADD COLUMN IF NOT EXISTS). 기존 데이터 보존.
-- DB 엔진: MariaDB 11.6
--
--   member_id NULL  → 비회원 글/댓글 (page_visit.member_id와 동일한 "로그인이면 회원ID, 아니면 NULL" 패턴)
--   guest_name      → 비회원이 입력한 표시 이름(선택). 작성자 표기는 이 값 → 없으면 '비회원'.
USE ldb_auth;

ALTER TABLE board_post    MODIFY member_id BIGINT NULL;
ALTER TABLE board_post    ADD COLUMN IF NOT EXISTS guest_name VARCHAR(50) NULL AFTER member_id;
ALTER TABLE board_comment MODIFY member_id BIGINT NULL;
ALTER TABLE board_comment ADD COLUMN IF NOT EXISTS guest_name VARCHAR(50) NULL AFTER member_id;
