-- LawQuery 인증 시스템 전용 DB (법령 데이터와 완전 독립)
-- 적용:  mysql -u root -p < db/auth_schema.sql
-- 재실행 안전(IF NOT EXISTS). 기존 데이터는 보존됨.
-- DB 엔진: MariaDB 11.6 (collation utf8mb4_uca1400_ai_ci)

-- 1) 전용 DB
CREATE DATABASE IF NOT EXISTS ldb_auth
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_uca1400_ai_ci;

-- 2) 기존 법령용 ldbuser에게 ldb_auth 권한 부여 (백엔드가 같은 유저로 접속)
GRANT ALL PRIVILEGES ON ldb_auth.* TO 'ldbuser'@'localhost';
GRANT ALL PRIVILEGES ON ldb_auth.* TO 'ldbuser'@'%';
FLUSH PRIVILEGES;

USE ldb_auth;

-- 3) 회원 테이블
--   signup_source='web' → status 기본 'pending' (관리자 수동 승인 대기)
--   signup_source='app' → 코드에서 status 'approved'로 생성 (앱 비밀토큰 검증 통과분)
CREATE TABLE IF NOT EXISTS member (
  id            BIGINT       NOT NULL AUTO_INCREMENT,
  email         VARCHAR(255) NOT NULL,                 -- 웹: 실제 이메일 / 앱: device_xxx@auto.lq 형태
  password_hash VARCHAR(255) NULL,                     -- 앱 익명계정은 NULL
  display_name  VARCHAR(100) NULL,
  signup_source ENUM('web','app')                       NOT NULL,
  status        ENUM('pending','approved','rejected','revoked') NOT NULL DEFAULT 'pending',
  role          ENUM('user','admin')                    NOT NULL DEFAULT 'user',
  device_key    VARCHAR(64)  NULL,                      -- 앱 익명계정 식별용(클라가 생성·보관). 웹은 NULL
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at   DATETIME     NULL,
  approved_by   BIGINT       NULL,
  last_login_at DATETIME     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_member_email (email),
  UNIQUE KEY uq_member_device (device_key),
  KEY idx_member_status (status),
  KEY idx_member_source (signup_source)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- 5) 페이지 접근 기록 (비로그인 포함, 페이지 진입마다 1행). 일자별 방문 추이 파악용.
CREATE TABLE IF NOT EXISTS page_visit (
  id         BIGINT       NOT NULL AUTO_INCREMENT,
  path       VARCHAR(255) NULL,
  ip         VARCHAR(64)  NULL,
  member_id  BIGINT       NULL,                  -- 로그인 상태면 회원ID, 아니면 NULL
  user_agent VARCHAR(512) NULL,
  visit_date DATE         NOT NULL,              -- 일자별 집계용
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_visit_date (visit_date),
  KEY idx_visit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- 4) 접속 기록 (로그인/앱진입 시 1행). 회원이 실제로 쓰는지 파악용.
CREATE TABLE IF NOT EXISTS access_log (
  id         BIGINT       NOT NULL AUTO_INCREMENT,
  member_id  BIGINT       NOT NULL,
  email      VARCHAR(255) NULL,
  event      ENUM('login','app_enter') NOT NULL DEFAULT 'login',
  ip         VARCHAR(64)  NULL,
  user_agent VARCHAR(512) NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_log_member (member_id),
  KEY idx_log_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
