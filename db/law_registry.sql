-- LawQuery 법령 레지스트리 — /api/law/list 의 단일 출처(명시적 목록).
-- 적용:  mysql -u root -p < db/law_registry.sql   (운영 DB에도 동일 실행)
-- 재실행 안전(IF NOT EXISTS / INSERT IGNORE). 기존 데이터 보존.
-- DB 엔진: MariaDB 11.6 (collation utf8mb4_uca1400_ai_ci)

USE ldb_auth;

-- 법령 목록 단일 출처. 새 법령 = ldb_<code> 적재 + 아래에 1행 INSERT.
CREATE TABLE IF NOT EXISTS law_registry (
  code        VARCHAR(16)  NOT NULL,                 -- ldb_<code> 의 code (예: j, y, s)
  label       VARCHAR(200) NULL,                     -- 표시명 override (NULL이면 db_meta의 법명 사용)
  sort_order  INT          NOT NULL DEFAULT 100,     -- 드롭다운 정렬(작을수록 위)
  enabled     TINYINT      NOT NULL DEFAULT 1,       -- 0이면 목록에서 숨김(DB는 있지만 비공개)
  kind        VARCHAR(20)  NOT NULL DEFAULT 'law',   -- 콘텐츠 종류: 'law' | (향후) 'accounting' 등
  PRIMARY KEY (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- 현재 법령 시드(드롭다운 순서 j → y → s → g → c 보존). label NULL = db_meta 의 법령명 사용.
INSERT IGNORE INTO law_registry (code, sort_order, kind) VALUES
  ('j', 10, 'law'),
  ('y', 20, 'law'),
  ('s', 30, 'law'),
  ('g', 40, 'law'),
  ('c', 50, 'law'),
  ('t', 60, 'law'),
  ('z', 70, 'law');
