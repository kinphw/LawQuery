-- ───────────────────────────────────────────────────────────────────────────
-- 해외법령 메모: 개인(member별 비공개) → 운영자 큐레이션(전역 공개) 전환
--
--   변경: 작성=운영자(adminGuard), 열람=전체 공개. 더는 회원별이 아니라 법조문(seg)별 1건.
--         member_id / FK / 회원 유니크키 제거, (law_code, article_no, seg_index) 전역 유니크로.
--   기존 메모(운영자 작성분)는 보존된다(중복 seg 없음 전제 — 운영자 1인 작성이라 안전).
--
--   적용:  mysql -uroot -p < db/foreign_memo_global.sql
--   ※ 비운영(dev)·운영(prod) 양쪽에 1회씩 적용. 메모는 이관(replicate) 범위 밖이라
--     각 환경에서 운영자가 직접 작성한다(운영=라이브 큐레이션).
-- ───────────────────────────────────────────────────────────────────────────

USE ldb_auth;

-- 1) 회원 결합 제거(FK → 인덱스 → 컬럼 순서로 드롭).
ALTER TABLE foreign_memo DROP FOREIGN KEY fk_foreign_memo_member;
ALTER TABLE foreign_memo DROP INDEX uq_member_seg;
ALTER TABLE foreign_memo DROP INDEX idx_member_law;
ALTER TABLE foreign_memo DROP COLUMN member_id;

-- 2) 전역 유니크키(법조문 seg 1건) + 법별 조회 인덱스.
ALTER TABLE foreign_memo ADD UNIQUE KEY uq_seg (law_code, article_no, seg_index);
ALTER TABLE foreign_memo ADD KEY idx_law (law_code);
