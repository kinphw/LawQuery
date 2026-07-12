-- ───────────────────────────────────────────────────────────────────────────
-- 해외법령 교정·메모 앵커 지문(anchor_hash) — 재적재로 행 구조가 바뀌어도 안전하게
--
--   문제: 교정(foreign_override)·메모(foreign_memo)는 (law_code, article_no, seg_index)
--         논리키로 베이스에 붙는데, seg_index 는 저장값이 아니라 조회 때 위치로 계산되는
--         순번(ROW_NUMBER PARTITION BY article_no ORDER BY ordinal)이다. 베이스(fin_law_db)
--         재적재가 한 seg 를 여러 seg 로 '분리'하면 순번이 밀려, old seg 3 에 걸어둔 교정이
--         new seg 3(다른 내용)에 조용히 덮어씌워진다(유실보다 나쁜 오염). 게다가 편집 당시
--         원본이 무엇이었는지 저장한 게 없어 이 드리프트를 감지할 수도 없었다.
--
--   해법: 편집 시점 그 seg 의 '원문 정체성 지문'(normalize(text_original)||heading 의 SHA-256)을
--         함께 저장한다. 조회 시:
--           · 저장 지문 == 현재 그 위치 원문 지문  → 그대로 적용
--           · 위치는 밀렸지만 같은 조 안에 지문이 일치하는 seg 가 유일  → 그 seg 로 자가 치유(적용)
--           · 어디에도 일치 없음(원문 자체가 분리/변경)  → 적용 안 함(억제) + 관리자에게 '재확인' 뱃지
--         → 조용한 오염이 원천 차단되고, 단순 순서 이동은 자동으로 따라간다.
--
--   레거시(이 컬럼 없던 시절 행) = anchor_hash IS NULL → 조회 시 '적용하되 미검증' 취급
--   (기존 교정을 갑자기 숨기지 않음). 관리자가 재저장하면 지문이 채워져 완전 가드로 승격.
--
--   적용:  mysql -uroot -p < db/foreign_anchor_hash.sql   (dev·prod 각 1회)
--   런타임(ldbuser)은 ldb_auth 쓰기 권한이 이미 있어 추가 GRANT 불필요.
-- ───────────────────────────────────────────────────────────────────────────

USE ldb_auth;

-- MariaDB: ADD COLUMN IF NOT EXISTS 로 재실행 안전.
ALTER TABLE foreign_override
  ADD COLUMN IF NOT EXISTS anchor_hash CHAR(64) NULL
    COMMENT '편집 당시 base 원문 정체성 지문(SHA-256). NULL=레거시(미검증)' AFTER value;

ALTER TABLE foreign_memo
  ADD COLUMN IF NOT EXISTS anchor_hash CHAR(64) NULL
    COMMENT '편집 당시 base 원문 정체성 지문(SHA-256). NULL=레거시(미검증)' AFTER memo;

-- (선택) 현재 정렬이 옳다고 확신하면 아래를 실행해 기존 행을 '현재 베이스'에 못박아
--        레거시(미검증) 뱃지를 한 번에 없앨 수 있다. 단, 이미 어긋난 교정도 '정상'으로
--        굳혀버리므로 되도록 관리자 화면에서 하나씩 재확인 후 재저장하는 것을 권장한다.
--        (지문 계산식이 앱과 동일해야 하므로 SQL 일괄 백필은 제공하지 않는다 —
--         앱의 재정착(reanchor) 엔드포인트나 재저장으로 채우는 것이 안전하다.)
