-- ───────────────────────────────────────────────────────────────────────────
-- 해외법령 즐겨찾기(favorite) — 운영자 개인 강조표시(북마크). 행 색깔 강조.
--
--   원리(메모·오버레이와 동일 패턴): 원본(fin_law_db.law_provision)은 불변 베이스,
--   운영자가 표시한 강조(즐겨찾기)는 여기(ldb_auth, 별도 DB)에 논리키로 저장한다.
--   행 존재 = 즐겨찾기 ON. 열람·토글 모두 운영자 전용(강조색은 운영자에게만 노출).
--     · 이관(replicate)은 fin_law_db 만 건드리므로 즐겨찾기는 절대 유실되지 않는다.
--     · 끄기 = 해당 행 삭제. 원문 훼손 없음.
--     · 환경(dev/prod)별로 각각 보관(메모·오버레이와 동일).
--
--   적용:  mysql -uroot -p < db/foreign_favorite.sql   (dev·prod 각 1회)
--   런타임(ldbuser)은 ldb_auth 쓰기 권한이 이미 있어(메모와 동일) 추가 GRANT 불필요.
-- ───────────────────────────────────────────────────────────────────────────

USE ldb_auth;
CREATE TABLE IF NOT EXISTS foreign_favorite (
  id            BIGINT       NOT NULL AUTO_INCREMENT,
  law_code      VARCHAR(48)  NOT NULL  COMMENT 'fin_law_db.law.code',
  article_no    VARCHAR(32)  NOT NULL  COMMENT 'fin_law_db 조/ANNEX 묶음 키',
  seg_index     INT          NOT NULL  COMMENT 'article 내 1-based seg 순위(안정 앵커)',
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fav (law_code, article_no, seg_index),
  KEY idx_law (law_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
