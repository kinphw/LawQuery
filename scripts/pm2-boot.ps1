# LawQuery — 로그온 시 pm2 백엔드 복원 (작업 스케줄러 "LawQuery pm2 autostart" 가 호출)
#
# 왜 resurrect 인가: `pm2 save` 로 저장한 목록(C:\Users\<user>\.pm2\dump.pm2)을 그대로 되살리므로
#   기동 설정이 ecosystem 파일 한 곳에만 존재한다. 다만 dump 가 없거나(최초·삭제)
#   dev 작업 중 stop 된 상태로 저장됐을 수 있어, 살아나지 않으면 ecosystem 으로 직접 기동한다.
#
# 로그: logs\pm2-boot.log (부팅 시 왜 안 떴는지 추적용)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$log  = Join-Path $root 'logs\pm2-boot.log'
function Log([string]$m) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $m" | Out-File -FilePath $log -Append -Encoding utf8 }

# pm2 CLI 위치 — PATH 에 의존하지 않도록 npm 전역 shim 을 우선 사용
$pm2 = Join-Path $env:APPDATA 'npm\pm2.cmd'
if (-not (Test-Path $pm2)) { $pm2 = 'pm2' }  # 폴백: PATH 에서 해결

Log "boot: start (pm2=$pm2)"
# pm2 의 표 출력은 콘솔 전용(박스문자)이라 로그에 넣으면 깨진다 → 버리고, 결과는 아래 검증으로 남긴다.
& $pm2 resurrect *> $null

Start-Sleep -Seconds 3
$jlist = (& $pm2 jlist 2>$null) | Out-String
if ($jlist -notmatch '"name"\s*:\s*"lawquery"' -or $jlist -notmatch '"status"\s*:\s*"online"') {
  Log 'boot: resurrect 로 lawquery 가 online 이 아님 → ecosystem 으로 직접 기동'
  & $pm2 start (Join-Path $root 'ecosystem.local.config.js') *> $null
}

# 실제로 4000 이 응답하는지 확인 (MariaDB 기동 전이어도 HTTP 자체는 떠야 정상)
Start-Sleep -Seconds 2
try {
  $r = Invoke-WebRequest -Uri 'http://localhost:4000/api/law/list' -UseBasicParsing -TimeoutSec 10
  Log "boot: ok (HTTP $($r.StatusCode))"
} catch {
  Log "boot: 경고 — 4000 응답 없음: $_"
}
