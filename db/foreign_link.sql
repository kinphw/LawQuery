-- ─────────────────────────────────────────────────────────────────────────
-- fin_law_db.foreign_link — 일본법 하위규정 연계표(자동 추출 엣지) (LawQuery 소유)
--   실행: mysql -uroot -p < db/foreign_link.sql   (dev, 필요 시 prod에도 1회)
--
--   국내 5단 연계표(ldb_j.db_ref)의 해외(일본법) 대응물. 단, 국내 db_ref 가 큐레이션된
--   authoritative 데이터인 반면, 이 테이블은 **이미 적재된 law_provision 본문에서 정형 인용
--   (法第N条·令第N条·銀行法第N条 …)을 정규식+한자수사 파서로 추출한 best-effort 엣지**다.
--   → 프론트에 '자동 추출 연계'로 표기. 빌더: LawQuery-law/foreign/etl/build_jp_links.py
--
--   방향: src(하위규정 조) → dst(모법/시행령/타법 조). 역방향(모법→하위)은 조회 시 dst 로 반전.
--   안정 논리키 = (src_code, src_article, dst_code, dst_article) — 물리 id 재적재에 무관.
--   재빌드 멱등: 빌더가 전체 DELETE 후 재삽입.
-- ─────────────────────────────────────────────────────────────────────────

USE fin_law_db;

CREATE TABLE IF NOT EXISTS foreign_link (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  src_code     VARCHAR(48)  NOT NULL COMMENT '참조하는(하위) 법령 code — 예 jp_epi_co',
  src_article  VARCHAR(32)  NOT NULL COMMENT '참조가 나타난 조 번호(law_provision.article_no 형식: 2, 62의3)',
  dst_code     VARCHAR(48)  NOT NULL COMMENT '참조되는(상위/타) 법령 code — 예 jp_psa',
  dst_article  VARCHAR(32)  NOT NULL COMMENT '참조된 조 번호(대상 law_provision.article_no 와 매칭 검증됨)',
  dst_para     VARCHAR(16)  DEFAULT NULL COMMENT '참조된 항(項) — 표시용 힌트(예: 5)',
  rel_kind     ENUM('delegates','reference') NOT NULL DEFAULT 'reference'
                 COMMENT 'delegates=위임시행(…に規定する内閣府令/政令で定める) / reference=일반 상호참조',
  raw          VARCHAR(255) DEFAULT NULL COMMENT '매칭된 인용 원문(예: 法第二条第五項第四号) — 감사·디버그용',
  ref_count    INT          NOT NULL DEFAULT 1 COMMENT '이 (src조→dst조·항) 엣지가 본문에서 등장한 횟수',
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_src (src_code, src_article),
  KEY idx_dst (dst_code, dst_article)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- 개발계 ldbuser DML(신규 법령 적재·연계 재빌드를 LQ 세션에서 직접). 운영 반영은 이관 경유.
GRANT SELECT, INSERT, UPDATE, DELETE ON fin_law_db.foreign_link TO 'ldbuser'@'localhost';
FLUSH PRIVILEGES;
