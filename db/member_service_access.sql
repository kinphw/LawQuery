-- 회원 서비스별 이용 허용 (LawQuery / AcctQuery)
--
-- ldb_auth.member 는 LawQuery(LQ)와 AcctQuery(AQ)가 함께 쓴다. 지금까지는 status='approved' 하나로
-- 두 서비스가 모두 열렸는데, AQ 에는 비공개 자료가 있어 서비스별로 가른다.
--   lq_access = 1 → LawQuery 이용 허용      aq_access = 1 → AcctQuery 이용 허용
--   role='admin' 은 값과 무관하게 항상 통과(판정은 각 서비스 코드).
--   가입 신청 행은 신청한 서비스만 1 로 들어온다(LQ 신청 = lq 1 / aq 0, AQ 신청 = lq 0 / aq 1).
--
-- 적용:  mysql -u root -p < db/member_service_access.sql
-- 순서:  이 SQL 을 먼저 적용한 뒤 코드를 반영한다(npm run serve). 컬럼 없이 코드만 올리면
--        관리자 외 전원이 차단되고 가입 신청 INSERT 가 실패한다.
--        반대로 이 SQL 만 먼저 적용하는 것은 기존 LQ·AQ 코드에 영향이 없다(추가형 변경).
--
-- ⚠️ 한 번만 실행한다. 아래 UPDATE 를 다시 돌리면 관리자가 꺼둔 허용이 도로 켜진다.
--    그래서 ALTER 에 IF NOT EXISTS 를 일부러 쓰지 않았다 — 재실행하면 "Duplicate column" 으로
--    첫 문장에서 멈춰 UPDATE 까지 가지 않는다.

USE ldb_auth;

ALTER TABLE member
  ADD COLUMN lq_access TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'LawQuery 이용 허용' AFTER role,
  ADD COLUMN aq_access TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'AcctQuery 이용 허용' AFTER lq_access;

-- 기존 승인 회원은 지금까지 두 서비스를 모두 쓸 수 있었다 → 그 범위를 그대로 유지한다.
UPDATE member SET lq_access = 1, aq_access = 1 WHERE status = 'approved';

-- 확인
SELECT id, login_id, role, status, lq_access, aq_access FROM member ORDER BY id;
