# LawQuery - clean up stale dev watchers left from previous runs
# (webpack / ts-node-dev / sass / tsc).
#
# - Only targets THIS project's dev processes, identified by command-line pattern.
# - Only kills processes older than the grace period (default 20s), so freshly
#   started sibling watchers in the current run are never killed (removes duplicates only).
# Invoked from npm predev / predev:full hooks.

$graceSeconds = 20
$cutoff  = (Get-Date).AddSeconds(-$graceSeconds)
# Match: webpack serve/watch, ts-node-dev backend, sass watch, tsc --noEmit --watch
$pattern = 'webpack\.config\.js|backend[\\/]ts[\\/]index\.ts|style\.scss|--noEmit'

# 상시가동(pm2)용 백엔드가 4000 을 점유 중이면 dev 백엔드가 EADDRINUSE 로 뜨지 않는다.
# → dev 진입 시 잠시 내리고, dev 종료 시 postdev 훅이 다시 올린다(수동 복구: npm run pm2:start).
$pm2Online = (& pm2 jlist 2>$null) | Out-String
if ($pm2Online -match '"name"\s*:\s*"lawquery"' -and $pm2Online -match '"status"\s*:\s*"online"') {
  Write-Host 'predev: stopping always-on pm2 backend (lawquery) to free port 4000.'
  & pm2 stop lawquery 2>$null | Out-Null
}

$stale = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -and ($_.CommandLine -match $pattern) -and ($_.CreationDate -lt $cutoff) }

if (-not $stale) {
  Write-Host 'predev: no stale dev watchers to clean up.'
  exit 0
}

foreach ($p in $stale) {
  # Kill the whole tree (child worker / cmd wrapper included)
  taskkill /PID $p.ProcessId /T /F 2>$null | Out-Null
  Write-Host "predev: killed stale dev watcher PID $($p.ProcessId)"
}
