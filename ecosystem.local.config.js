/**
 * LawQuery 로컬 상시가동(pm2) 설정 — 이 PC 한 대에서만 쓰는 구성.
 *
 * 구조: Apache(https://codexa.test) 가 정적파일을 서빙하고 /api/ 만 이 백엔드(4000)로 프록시.
 *       Apache · MariaDB 는 Windows 서비스(자동시작)라 이미 상시가동 → 남은 조각이 이 Node 백엔드다.
 *
 * 왜 컴파일된 js(src/backend/js) 인가:
 *   상시가동은 "편집 중 깨져도 계속 떠 있어야" 하므로, 편집 중인 ts 를 watch 하지 않고
 *   빌드 산출물을 고정 실행한다. 코드 수정 반영은 `npm run serve`(빌드+재시작).
 *
 * 사용:
 *   npm run pm2:start   # 기동 + 부팅복원 목록 저장
 *   npm run serve       # 코드 수정분 빌드 → 재시작
 *   npm run pm2:logs    # 로그
 */
const path = require('path');

module.exports = {
  apps: [
    {
      name: 'lawquery',
      script: 'src/backend/js/index.js',
      // .env 를 process.cwd() 에서 읽으므로(config/env.ts) cwd 고정이 필수.
      cwd: __dirname,
      watch: false,
      autorestart: true,
      min_uptime: '10s',   // 10초 못 버티고 죽으면 '크래시'로 계산
      max_restarts: 20,    // 크래시 루프면 20회 후 포기(무한 재시작 방지)
      restart_delay: 2000,
      max_memory_restart: '600M',
      time: true,          // 로그 줄마다 타임스탬프
      out_file: path.join(__dirname, 'logs/pm2-lawquery-out.log'),
      error_file: path.join(__dirname, 'logs/pm2-lawquery-error.log'),
      env: {
        NODE_ENV: 'production', // 쿠키 secure·JWT_SECRET 강제 등 안전 분기 활성화
      },
    },
  ],
};
