-- ───────────────────────────────────────────────────────────────────────────
-- 해외법령 관리자 인라인 수정 — 개발계 런타임 계정에 본문 UPDATE 권한 부여
--
--   배경: foreign_setup.sql 은 ldbuser 에게 fin_law_db SELECT 만 부여했다(읽기 소비).
--         관리자 인라인 수정(뷰 화면의 '수정' 버튼)은 개발계 fin_law_db.law_provision 을
--         직접 UPDATE 하므로 쓰기 권한이 추가로 필요하다.
--
--   적용(개발계, root 1회):  mysql -uroot -p < db/foreign_admin_grant.sql
--   (운영은 MYSQL_USER=root 라 별도 GRANT 불필요. 또한 백엔드가 NODE_ENV=production 에서
--    인라인 수정을 차단하므로 운영 직접 편집은 일어나지 않는다 — 개발계 수정 후 허브 이관.)
--
--   ※ foreign_setup.sql 을 통째로 재실행하면 foreign_memo 가 DROP 되므로(메모 유실),
--     권한만 추가하려면 이 파일을 쓴다.
-- ───────────────────────────────────────────────────────────────────────────

GRANT UPDATE ON fin_law_db.law_provision TO 'ldbuser'@'localhost';
FLUSH PRIVILEGES;
