$ErrorActionPreference = 'SilentlyContinue'

$base      = Split-Path -Parent $MyInvocation.MyCommand.Path
$watch     = Join-Path $base 'server-watchdog.log'
$serverLog = Join-Path $base 'server.log'
$errorLog  = Join-Path $base 'server-error.log'
$nextBin   = Join-Path $base 'node_modules\next\dist\bin\next'
$nodeExe   = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $nodeExe) { $nodeExe = 'node.exe' }

function Write-Log([string]$msg) {
  ('{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg) | Out-File -Append -FilePath $watch
}

function Test-PortUp([int]$port) {
  return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

# Start a server ONLY if nothing is already listening on the port. Never kill a
# healthy port owner (that caused multi-watchdog restart storms). If multiple
# watchdog copies race to start, the first one wins the bind and the others are
# idle observers.
function Start-WebApp([int]$port) {
  if (Test-PortUp $port) { return $null }
  $p = Start-Process -FilePath $nodeExe `
    -ArgumentList ('"{0}"' -f $nextBin), 'start' `
    -WorkingDirectory $base `
    -WindowStyle Hidden `
    -RedirectStandardOutput $serverLog `
    -RedirectStandardError $errorLog `
    -PassThru
  if ($p) { Write-Log ('started next start (pid {0})' -f $p.Id) } else { Write-Log 'FAILED to start next (Start-Process returned nothing)' }
  return $p
}

# Single-instance guard: exactly one watchdog supervises. Later copies (e.g.
# spawned repeatedly by external keep-alive systems) exit immediately so we
# never stack idle watchdog processes or restart storms.
$dupes = @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*run-localhost.ps1*' -and $_.ProcessId -ne $PID })
if ($dupes.Count -gt 0) {
  Write-Log 'duplicate watchdog detected - exiting'
  exit 0
}

Write-Log '=== watchdog started (production mode) ==='
while ($true) {
  if (-not (Test-PortUp 3000)) {
    Start-WebApp 3000
  }
  Start-Sleep -Seconds 8
}