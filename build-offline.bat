@echo off
chcp 65001 > nul
cd /d "%~dp0"

echo.
echo ==========================================================
echo   LawQuery 오프라인판(단독실행) 배포본 만들기
echo ==========================================================
echo.
echo   지금 DB에 들어 있는 최신 데이터로 새 사본을 뽑습니다.
echo   MySQL(MariaDB) 이 켜져 있어야 합니다.
echo.
echo   1) 국내법령 9개 + 유권해석을 SQLite 로 추출
echo   2) 로컬 전용 번들 빌드
echo   3) 폴더 구성 후 zip 한 장으로 압축
echo.

call npm run local:zip
if errorlevel 1 goto :failed

echo.
echo ==========================================================
echo   완료 — release 폴더의 zip 을 전달하세요.
echo ==========================================================
echo.
start "" "%~dp0release"
pause
exit /b 0

:failed
echo.
echo ==========================================================
echo   실패했습니다. 위 메시지를 확인하세요.
echo.
echo   자주 있는 원인:
echo     - MySQL(MariaDB) 서비스가 꺼져 있음
echo     - .env 의 접속 정보가 맞지 않음
echo     - npm install 이 안 된 상태
echo ==========================================================
echo.
pause
exit /b 1
