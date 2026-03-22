# ── Configuration ────────────────────────────────────────────────────────────
$Port = 8080
# ─────────────────────────────────────────────────────────────────────────────

Write-Host ">> Looking for server on port $Port..." -ForegroundColor Cyan

$connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue

if (-not $connection) {
    Write-Host ">> No process is listening on port $Port. Server is already stopped." -ForegroundColor Yellow
    exit 0
}

$pid = $connection.OwningProcess
$process = Get-Process -Id $pid -ErrorAction SilentlyContinue

if (-not $process) {
    Write-Host ">> Could not find process with PID $pid." -ForegroundColor Yellow
    exit 1
}

Write-Host ">> Stopping '$($process.Name)' (PID $pid)..." -ForegroundColor Cyan
Stop-Process -Id $pid -Force

# Confirm it is gone
$stopped = $false
for ($i = 0; $i -lt 10; $i++) {
    Start-Sleep -Milliseconds 300
    if (-not (Get-Process -Id $pid -ErrorAction SilentlyContinue)) {
        $stopped = $true
        break
    }
}

if ($stopped) {
    Write-Host ">> Server stopped." -ForegroundColor Green
} else {
    Write-Error "Process $pid is still running after stop attempt."
    exit 1
}

