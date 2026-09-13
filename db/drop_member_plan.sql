-- 유료화(등급) 개념 철폐 — member 의 plan 컬럼 제거 (2026-09-01)
--
-- 배경: 1인 사용 체제로 전환하며 free/pro 등급과 유료화 계획을 폐기했다.
--       코드에서는 plan·plan_expires_at 을 모두 제거했고(authGuard·MemberModel·
--       AdminController·admin.html 등), 이 컬럼은 아무도 읽지 않는다.
--
-- ⚠️ 되돌릴 수 없다(컬럼과 그 값이 사라진다). 코드 배포 후에 실행할 것.
--    남겨 두어도 동작에는 아무 영향이 없으므로, 굳이 지우지 않아도 된다.

ALTER TABLE member DROP COLUMN IF EXISTS plan;
ALTER TABLE member DROP COLUMN IF EXISTS plan_expires_at;
