-- ───────────────────────────────────────────────────────────────────────────
-- 해외법령 카탈로그 — 표시·분류·설명 큐레이션 (LawQuery 소유)
--   실행(root):  mysql -uroot -p < db/foreign_catalog.sql
--
--   sentinel(fin_law_db.law)은 원문 적재 시 manifest 하드코딩 메타를 DELETE+INSERT 로 매번
--   덮어쓰므로, LQ 가 편집할 메타·설명은 여기(ldb_auth.foreign_catalog)에 둔다.
--   카탈로그/드롭다운 렌더 = law(폴백) ⊕ foreign_catalog(우선). sentinel·MCP 무영향.
--   허브(LawQuery-law)에서 편집 + 개발→운영 복제(law_registry 와 동일 패턴).
-- ───────────────────────────────────────────────────────────────────────────
USE ldb_auth;

CREATE TABLE IF NOT EXISTS foreign_catalog (
  code         VARCHAR(48)  NOT NULL,
  jurisdiction VARCHAR(16)  DEFAULT NULL COMMENT '정렬·그룹용(law 와 동기화)',
  title_ko     VARCHAR(512) DEFAULT NULL COMMENT '한글 통용명(override)',
  abbrev       VARCHAR(64)  DEFAULT NULL COMMENT '약칭(override)',
  status       VARCHAR(32)  DEFAULT NULL COMMENT 'in_force/proposal … (override)',
  law_type     VARCHAR(40)  DEFAULT NULL,
  is_crypto    TINYINT(1)   DEFAULT NULL,
  summary      TEXT         DEFAULT NULL COMMENT '카드/뷰어 1~2문장 역할 설명',
  tags         JSON         DEFAULT NULL COMMENT '분야 칩 배열',
  highlights   JSON         DEFAULT NULL COMMENT '주요 내용 불릿 배열',
  sort_order   INT          NOT NULL DEFAULT 100,
  hidden       TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '1이면 카탈로그·드롭다운에서 숨김',
  updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- ↑ collation 은 fin_law_db.law(utf8mb4_unicode_ci)와 일치시킨다.
--   카탈로그 렌더가 law ⊕ foreign_catalog cross-db JOIN/COALESCE 를 쓰므로 collation 이 같아야 한다.
