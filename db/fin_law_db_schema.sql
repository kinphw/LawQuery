-- ─────────────────────────────────────────────────────────────────────────
-- fin_law_db — 해외 결제·전자금융·가상자산 법령 저장소 (LawQuery 소유)
--   실행: mysql -uroot -p < db/fin_law_db_schema.sql   (신규 환경 프로비저닝용)
--   ※ 기존 DB 리셋이 필요하면 수동으로 DROP DATABASE 후 실행 (안전을 위해 DROP 미포함)
--
--   소유권(2026-07-02 이전 완료): 원문 적재 ETL·스키마·번역 모두 LawQuery 소유.
--     · 원문 ETL: c:/projects/LawQuery-law/foreign/etl/ (manifest.py = 법령 큐레이션 메타)
--     · 번역 적재: c:/projects/LawQuery/scripts/foreign/fill_*.py (text_ko / heading_ko)
--     · dev→prod 이관: LawQuery-law 허브 대시보드 '해외법령 이관' (code 단위 row-copy)
--     · sentinel 은 읽기 소비자: foreign-law-mcp(fdbuser SELECT) + 파생 임베딩
--       테이블 law_provision_chunks 만 쓰기(재적재 후 sentinel 재인덱싱 필요)
--
--   설계: 2계층.  law(법률 1건 = 1행)  →  law_provision(조문 세그먼트 1행)
--     · seg-level: 1 law_provision 행 = article 내 개행(항목/문단) 단위 1 seg.
--     · 안정 논리키 = (law.code, article_no, seg_index[=article 내 ordinal 순위]) —
--       재적재로 물리 id 가 바뀌어도 메모(ldb_auth.foreign_memo)·교정(foreign_override)·
--       임베딩 파생물이 이 키로 보존된다.
--     · 조문 앵커(part_no/article_no/para_no/heading)는 ETL best-effort(forward-fill).
--       파싱 실패는 NULL로 두되 텍스트는 항상 보존 — 이질적 포맷(EU 제안서·일본 章条項号·
--       미국 §-(a)-(1))에 견고.
--   번역: 대부분 기계번역(translation_source='machine'). 인용·해석은 원문 우선.
-- ─────────────────────────────────────────────────────────────────────────

CREATE DATABASE IF NOT EXISTS fin_law_db
  DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

USE fin_law_db;

-- ── 법률(문서) 1건 ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS law (
  id                 INT          NOT NULL AUTO_INCREMENT,
  code               VARCHAR(48)  NOT NULL COMMENT '슬러그: eu_psd3, jp_psa, us_genius, hk_amlo …',
  jurisdiction       ENUM('eu','us','jp','hk','sg','other') NOT NULL,
  title_original     VARCHAR(512) NOT NULL COMMENT '원문 정식명',
  title_ko           VARCHAR(512) NOT NULL COMMENT '한글 통용명',
  abbrev             VARCHAR(64)  DEFAULT NULL COMMENT '약칭(PSD3, GENIUS, MiCAR …)',
  law_type           ENUM('directive','regulation','act','bill','ordinance','cabinet_order','cabinet_office_ordinance','other')
                       NOT NULL DEFAULT 'other',
  status             ENUM('in_force','enacted','proposal','passed_one_chamber','repealed','unknown')
                       NOT NULL DEFAULT 'unknown'
                       COMMENT 'in_force/enacted=현행, proposal=제안(미발효), passed_one_chamber=일원만 통과(미발효), repealed=폐지(현행 아님)',
  is_crypto          TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '가상자산 관련 법령(MiCAR·GENIUS·CLARITY·Anti-CBDC 등)',
  year               VARCHAR(16)  DEFAULT NULL,
  official_citation  VARCHAR(512) DEFAULT NULL COMMENT '인용 양식 템플릿(조문번호는 {art}로 치환 안내)',
  source_url         VARCHAR(1024) DEFAULT NULL,
  translation_source ENUM('machine','official','none') NOT NULL DEFAULT 'machine',
  source_file        VARCHAR(255) DEFAULT NULL COMMENT '적재 출처 파일(provenance)',
  note               TEXT         DEFAULT NULL,
  provision_count    INT          NOT NULL DEFAULT 0,
  created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_code (code),
  KEY idx_juris (jurisdiction),
  KEY idx_status (status)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ── 조문 세그먼트 ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS law_provision (
  id             BIGINT       NOT NULL AUTO_INCREMENT,
  law_id         INT          NOT NULL,
  ordinal        INT          NOT NULL COMMENT '법률 내 순번(전역, 문서 순서)',
  part_no        VARCHAR(255) DEFAULT NULL COMMENT '편/장(章·Part·Title·Chapter) 앵커 또는 제목',
  article_no     VARCHAR(32)  DEFAULT NULL COMMENT '조/Section/Article 번호(forward-fill). 예: 5, 62의3',
  para_no        VARCHAR(32)  DEFAULT NULL COMMENT '항(項·paragraph) 번호(best-effort, article 내 비유일 — 표시 전용)',
  heading        VARCHAR(255) DEFAULT NULL COMMENT '조 제목(목적/정의/Short title …) — 각 조 첫 seg 에만',
  heading_ko     VARCHAR(512) DEFAULT NULL COMMENT '조 제목 한국어(목차용) — LQ 번역 스크립트가 채움',
  seg_kind       ENUM('preamble','article','paragraph','item','heading','other')
                   NOT NULL DEFAULT 'other' COMMENT '세그먼트 성격',
  text_original  MEDIUMTEXT   DEFAULT NULL COMMENT '원문(EN/JP …)',
  text_ko        MEDIUMTEXT   DEFAULT NULL COMMENT '한글 번역(주로 기계번역) — LQ 소유',
  char_count     INT          NOT NULL DEFAULT 0,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_law (law_id),
  KEY idx_law_article (law_id, article_no),
  KEY idx_law_ordinal (law_id, ordinal),
  CONSTRAINT fk_provision_law FOREIGN KEY (law_id)
    REFERENCES law (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ── RAG 의미검색용 청크 임베딩 — sentinel 파생물(쓰기 주체 = sentinel 인덱서) ────
--    LQ 가 원문을 재적재/추가하면 sentinel 쪽 재인덱싱 필요 (backend/scripts/rag/index-foreign-law.ts)
CREATE TABLE IF NOT EXISTS law_provision_chunks (
  id              BIGINT       NOT NULL AUTO_INCREMENT,
  provision_id    BIGINT       NOT NULL COMMENT 'law_provision.id',
  law_id          INT          NOT NULL,
  chunk_index     INT          NOT NULL,
  chunk_text      MEDIUMTEXT   NOT NULL COMMENT '임베딩 대상(원문 또는 한글)',
  lang            ENUM('orig','ko') NOT NULL DEFAULT 'ko',
  embedding       LONGBLOB     NOT NULL COMMENT 'Float32 LE bytes (3072d)',
  embedding_model VARCHAR(64)  NOT NULL,
  embedding_dim   INT          NOT NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_provision (provision_id),
  KEY idx_law (law_id),
  CONSTRAINT fk_chunk_provision FOREIGN KEY (provision_id)
    REFERENCES law_provision (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ── 계정 ──────────────────────────────────────────────────────────────────
-- sentinel MCP 런타임 read-only 계정 (sentinel .mcp.json 의 foreign_law/foreign_law_rag 가 사용)
CREATE USER IF NOT EXISTS 'fdbuser'@'localhost' IDENTIFIED BY '1226';
GRANT SELECT ON fin_law_db.* TO 'fdbuser'@'localhost';

-- LawQuery 개발계 편의: ldbuser 에 DML (신규 법령 적재·교정을 LQ 세션에서 직접)
-- ※ 운영(prod)에는 적용하지 않음 — 운영 반영은 허브 '해외법령 이관'(root, SSH터널) 경유가 원칙
GRANT SELECT, INSERT, UPDATE, DELETE ON fin_law_db.* TO 'ldbuser'@'localhost';
FLUSH PRIVILEGES;
