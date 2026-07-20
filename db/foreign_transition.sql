-- PSD2/EMD2 -> PSD3/PSR 이행분석 (LawQuery 큐레이션 레이어)
--
-- 원문(fin_law_db.law/law_provision)은 변경하지 않는다. 공식 Annex III 상관표에서
-- 추출한 구조적 관계와 LawQuery의 내용변경 평가는 ldb_auth에 버전별로 저장한다.
-- 실행은 scripts/foreign/seed_psd_transition.ts --migrate 가 담당한다.

CREATE TABLE IF NOT EXISTS ldb_auth.foreign_transition_version (
  id              INT          NOT NULL AUTO_INCREMENT,
  code            VARCHAR(64)  NOT NULL,
  label_ko        VARCHAR(255) NOT NULL,
  basis_ko        VARCHAR(512) NOT NULL,
  as_of_date      DATE         NOT NULL,
  lifecycle       ENUM('proposal','adopted','archived') NOT NULL DEFAULT 'proposal',
  publish_status  ENUM('draft','published','archived')  NOT NULL DEFAULT 'published',
  source_urls     JSON         NOT NULL,
  notice_ko       VARCHAR(1000) NOT NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_foreign_transition_version_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ldb_auth.foreign_transition_group (
  id                BIGINT       NOT NULL AUTO_INCREMENT,
  version_id        INT          NOT NULL,
  group_key         VARCHAR(64)  NOT NULL,
  source_row_no     INT          NOT NULL,
  relation_shape    ENUM('one_to_one','split','merge','many_to_many','new','deleted','unmapped') NOT NULL,
  evidence_status   ENUM('both','psd3_annex','psr_annex','conflict') NOT NULL,
  conflict_note     TEXT         DEFAULT NULL,
  psd3_row_json     JSON         DEFAULT NULL,
  psr_row_json      JSON         DEFAULT NULL,
  created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_foreign_transition_group (version_id, group_key),
  KEY idx_foreign_transition_group_version (version_id, source_row_no),
  CONSTRAINT fk_foreign_transition_group_version
    FOREIGN KEY (version_id) REFERENCES ldb_auth.foreign_transition_version(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ldb_auth.foreign_transition_member (
  id             BIGINT       NOT NULL AUTO_INCREMENT,
  group_id       BIGINT       NOT NULL,
  side           ENUM('current','future') NOT NULL,
  law_code       VARCHAR(48)  NOT NULL,
  article_no     VARCHAR(32)  DEFAULT NULL,
  display_ref    VARCHAR(255) NOT NULL,
  raw_ref        VARCHAR(255) NOT NULL,
  member_order   INT          NOT NULL DEFAULT 0,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_foreign_transition_member (group_id, side, law_code, article_no, display_ref),
  KEY idx_foreign_transition_member_lookup (law_code, article_no, side),
  CONSTRAINT fk_foreign_transition_member_group
    FOREIGN KEY (group_id) REFERENCES ldb_auth.foreign_transition_group(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ldb_auth.foreign_transition_assessment (
  id               BIGINT       NOT NULL AUTO_INCREMENT,
  version_id       INT          NOT NULL,
  law_code         VARCHAR(48)  NOT NULL,
  article_no       VARCHAR(32)  NOT NULL,
  structural_type  ENUM('one_to_one','split','merge','many_to_many','new','deleted','pending') NOT NULL DEFAULT 'pending',
  change_type      ENUM('maintained','clarified','strengthened','relaxed','material_change','pending') NOT NULL DEFAULT 'pending',
  summary_ko       TEXT         DEFAULT NULL,
  detail_ko        MEDIUMTEXT   DEFAULT NULL,
  similarity_pct   DECIMAL(5,2) DEFAULT NULL,
  -- automatic = 코사인 유사도 자동초안 / analyzed = 원문 대조 정밀 대사(AI) / reviewed = 사람 검수.
  -- 정밀 대사(analyzed)와 사람 검수(reviewed)는 재시드 시 보존한다(seed_psd_transition.ts UPSERT 참조).
  review_status    ENUM('automatic','analyzed','reviewed') NOT NULL DEFAULT 'automatic',
  reviewed_by      BIGINT       DEFAULT NULL,
  reviewed_at      DATETIME     DEFAULT NULL,
  created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_foreign_transition_assessment (version_id, law_code, article_no),
  KEY idx_foreign_transition_assessment_filter (version_id, law_code, change_type, structural_type),
  CONSTRAINT fk_foreign_transition_assessment_version
    FOREIGN KEY (version_id) REFERENCES ldb_auth.foreign_transition_version(id) ON DELETE CASCADE,
  CONSTRAINT fk_foreign_transition_assessment_reviewer
    FOREIGN KEY (reviewed_by) REFERENCES ldb_auth.member(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 정밀 요약표('무엇이 바뀌었나') — 조문별 정밀 대사를 주제 단위로 종합한 큐레이션 레이어.
-- 이행분석 화면 상단 '요약' 탭에서 렌더한다. 조문 단위 근거는 article_links 로 이행분석에 딥링크.
CREATE TABLE IF NOT EXISTS ldb_auth.foreign_transition_theme (
  id              BIGINT       NOT NULL AUTO_INCREMENT,
  version_id      INT          NOT NULL,
  theme_key       VARCHAR(64)  NOT NULL,
  sort_order      INT          NOT NULL DEFAULT 0,
  category_ko     VARCHAR(64)  NOT NULL,   -- 대분류(사기·책임 / 소비자보호 / 오픈뱅킹·오픈파이낸스 / 시장접근 / 감독·집행 / 전자화폐통합 …)
  title_ko        VARCHAR(255) NOT NULL,   -- 주제명
  impact          ENUM('new','strengthened','relaxed','clarified','restructured','maintained') NOT NULL DEFAULT 'strengthened',
  current_ref_ko  VARCHAR(512) DEFAULT NULL, -- 현행 근거(PSD2·EMD2 조문)
  future_ref_ko   VARCHAR(512) DEFAULT NULL, -- 변경 근거(PSD3·PSR 조문)
  summary_ko      TEXT         NOT NULL,   -- 무엇이 어떻게 바뀌었나
  detail_ko       MEDIUMTEXT   DEFAULT NULL, -- 실무 영향·주의
  article_links   JSON         DEFAULT NULL, -- [{"law_code":"eu_psr","article_no":"56"}] 이행분석 조문 딥링크
  publish_status  ENUM('draft','published','archived') NOT NULL DEFAULT 'published',
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_foreign_transition_theme (version_id, theme_key),
  KEY idx_foreign_transition_theme_order (version_id, publish_status, sort_order),
  CONSTRAINT fk_foreign_transition_theme_version
    FOREIGN KEY (version_id) REFERENCES ldb_auth.foreign_transition_version(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
