#!/bin/bash
set -e  # 에러 발생 시 즉시 종료

echo "📡 Step 1: Git Pull"
git pull origin main

echo "📥 Step 1.5: 의존성 설치(신규 패키지 반영, 예: compression)"
npm install --no-audit --no-fund

echo "🛠 Step 2: 백엔드 TypeScript 컴파일"
npx tsc -p tsconfig.backend.json

echo "📦 Step 3: 프론트엔드 Webpack 번들링"
npm run build

echo "🎨 Step 4: SCSS → CSS 컴파일"
npx sass assets/scss/style.scss assets/css/style.css --style=compressed --no-source-map

echo "🚀 Step 5: PM2 재시작"
npx pm2 restart lawquery-backend-prod

echo "✅ 배포 완료!"
