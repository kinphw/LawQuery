-- ───────────────────────────────────────────────────────────────────────────
-- 즐겨찾기(favorite) 통합 테이블 — 로그인 회원별 조문 강조표시(북마크).
--
--   해외법령(foreign)·국내법(law)을 한 테이블로 관리(scope로 구분). 회원별(member_id)이라
--   다기기 동기화·초기화에도 유지. 향후 도메인 통합 "내 즐겨찾기" 페이지의 단일 소스.
--     · scope='foreign' : law_code=fin_law_db.code, node_key='<article_no>|<seg_index>'
--     · scope='law'     : law_code=law 파라미터(j·y·…),  node_key=조문 셀 data-id('A2' 등)
--   행 존재 = ON. 원본(fin_law_db / ldb_*)은 불변, 즐겨찾기는 ldb_auth에만.
--
--   적용:  mysql -uroot -p < db/favorite.sql   (dev·prod 각 1회)
--   런타임(ldbuser)은 ldb_auth 쓰기 권한이 이미 있어(메모와 동일) 추가 GRANT 불필요.
-- ───────────────────────────────────────────────────────────────────────────

USE ldb_auth;

CREATE TABLE IF NOT EXISTS favorite (
  id            BIGINT       NOT NULL AUTO_INCREMENT,
  member_id     INT          NOT NULL  COMMENT 'ldb_auth.member.id (회원별)',
  scope         VARCHAR(16)  NOT NULL  COMMENT "'foreign' | 'law'",
  law_code      VARCHAR(48)  NOT NULL  COMMENT 'foreign: fin_law_db.code / law: law 파라미터(j·y·…)',
  node_key      VARCHAR(64)  NOT NULL  COMMENT "foreign: 'article_no|seg_index' / law: 조문 data-id",
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fav (member_id, scope, law_code, node_key),
  KEY idx_member_scope (member_id, scope, law_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- ── 기존 foreign_favorite(admin 전용 전역) → 통합 favorite 로 이관 ──
--    기존 즐겨찾기는 admin이 만든 것이므로 admin 회원에게 귀속시킨다(단일 admin 가정).
--    admin이 없으면(예: 신규 환경) 이관 건너뜀(빈 결과라 무해).
INSERT IGNORE INTO favorite (member_id, scope, law_code, node_key)
SELECT (SELECT id FROM member WHERE role = 'admin' ORDER BY id LIMIT 1) AS member_id,
       'foreign', f.law_code, CONCAT(f.article_no, '|', f.seg_index)
  FROM foreign_favorite f
 WHERE EXISTS (SELECT 1 FROM member WHERE role = 'admin');

-- 이관 확인 후(SELECT * FROM favorite WHERE scope='foreign') 아래 한 줄로 옛 테이블 정리:
--   신 코드 배포 뒤 실행할 것(구 코드가 foreign_favorite 를 참조하므로 코드 배포와 함께).
-- DROP TABLE IF EXISTS foreign_favorite;
