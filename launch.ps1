[CmdletBinding()]
param(
    [switch]$SkipBuild
)

# ── Configuration ────────────────────────────────────────────────────────────
$JarName        = "valheim-damage-calculator-1.0-SNAPSHOT.jar"
$HealthUrl      = "http://localhost:8080/health"
$AppUrl         = "http://localhost:8080"
$TimeoutSeconds = 30
$PollIntervalMs = 500
# ─────────────────────────────────────────────────────────────────────────────

$ProjectRoot = $PSScriptRoot
$JarPath     = Join-Path $ProjectRoot "target\$JarName"

Set-Location $ProjectRoot

# ── Build ────────────────────────────────────────────────────────────────────
if (-not $SkipBuild) {
    Write-Host ">> Building project..." -ForegroundColor Cyan
    & mvn package -DskipTests -q
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Build failed. Aborting."
        exit 1
    }
    Write-Host ">> Build complete." -ForegroundColor Green
}

if (-not (Test-Path $JarPath)) {
    Write-Error "Jar not found at '$JarPath'. Run without -SkipBuild first."
    exit 1
}

# ── Start server ─────────────────────────────────────────────────────────────
Write-Host ">> Starting server..." -ForegroundColor Cyan
$serverProcess = Start-Process `
    -FilePath       "java" `
    -ArgumentList   "-jar", $JarPath, "--server" `
    -WorkingDirectory $ProjectRoot `
    -PassThru `
    -WindowStyle    Minimized

# ── Poll health ───────────────────────────────────────────────────────────────
Write-Host ">> Waiting for server (up to ${TimeoutSeconds}s)..." -ForegroundColor Cyan
$elapsed = 0
$ready   = $false

while ($elapsed -lt $TimeoutSeconds) {
    try {
        $res = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -ErrorAction Stop -TimeoutSec 2
        if ($res.StatusCode -eq 200) {
            $ready = $true
            break
        }
    } catch { <# not ready yet #> }

    Start-Sleep -Milliseconds $PollIntervalMs
    $elapsed += $PollIntervalMs / 1000
}

if (-not $ready) {
    Write-Error "Server did not respond within $TimeoutSeconds seconds. Stopping process."
    Stop-Process -Id $serverProcess.Id -ErrorAction SilentlyContinue
    exit 1
}

# ── Open browser ──────────────────────────────────────────────────────────────
Write-Host ">> Server ready. Opening browser..." -ForegroundColor Green
Write-Host "   URL        : $AppUrl" -ForegroundColor DarkGray
Write-Host "   Server PID : $($serverProcess.Id)  (Stop-Process -Id $($serverProcess.Id) to shut down)" -ForegroundColor DarkGray

Start-Process $AppUrl

