# LawQuery - clean up stale dev watchers left from previous runs
# (webpack / ts-node-dev / sass / tsc).
#
# - Only targets THIS project's dev processes, identified by command-line pattern.
# - Only kills processes older than the grace period (default 20s), so freshly
#   started sibling watchers in the current run are never killed (removes duplicates only).
# Invoked from npm predev / predev:full / predev:fast hooks.

$graceSeconds = 20
$cutoff  = (Get-Date).AddSeconds(-$graceSeconds)
# Match: webpack serve/watch, ts-node-dev backend, sass watch, tsc --noEmit --watch
$pattern = 'webpack\.config\.js|backend[\\/]ts[\\/]index\.ts|style\.scss|--noEmit'

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
