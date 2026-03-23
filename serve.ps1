<#
.SYNOPSIS
    Serves the ui/ folder as a local static site using Node.js.

.DESCRIPTION
    Starts a zero-dependency Node.js HTTP server that serves the ui/ directory
    on http://localhost:3000 and opens the browser automatically.
    Press Ctrl+C to stop.

.EXAMPLE
    .\serve.ps1
    .\serve.ps1 -Port 8080
#>
[CmdletBinding()]
param(
    [int]$Port = 3001
)

$ProjectRoot = $PSScriptRoot
$UiDir       = Join-Path $ProjectRoot "ui"

if (-not (Test-Path $UiDir)) {
    Write-Error "ui/ directory not found at '$UiDir'."
    exit 1
}

# Verify Node.js is available
try {
    $null = & node --version 2>&1
} catch {
    Write-Error "Node.js is not installed or not on PATH. Install it from https://nodejs.org"
    exit 1
}

# Write the server script to a temp file to avoid multiline quoting issues on Windows
$TempScript = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "valheim-serve-$Port.mjs")

$ServerScript = @'
import http from 'node:http';
import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT   = parseInt(process.argv[2], 10);
const UI_DIR = process.argv[3];

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png':  'image/png',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
};

const server = http.createServer((req, res) => {
    const urlPath = new URL(req.url, 'http://localhost').pathname;

    // Resolve to a file path, defaulting '/' to index.html
    const relative = urlPath === '/' ? 'index.html' : urlPath.replace(/\.\./g, '');
    let filePath = path.join(UI_DIR, ...relative.split('/'));

    fs.stat(filePath, (err, stats) => {
        if (!err && stats.isDirectory()) {
            filePath = path.join(filePath, 'index.html');
        }

        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404 Not Found: ' + urlPath);
                return;
            }
            const ext  = path.extname(filePath).toLowerCase();
            const mime = MIME[ext] || 'application/octet-stream';
            res.writeHead(200, { 'Content-Type': mime });
            res.end(data);
        });
    });
});

server.listen(PORT, () => {
    console.log('Serving ui/ at http://localhost:' + PORT);
});
'@

Set-Content -Path $TempScript -Value $ServerScript -Encoding UTF8

Write-Host ">> Starting static file server on http://localhost:$Port ..." -ForegroundColor Cyan

# Open browser after a short delay
Start-Job -ScriptBlock {
    param($url)
    Start-Sleep -Milliseconds 800
    Start-Process $url
} -ArgumentList "http://localhost:$Port" | Out-Null

try {
    & node $TempScript $Port $UiDir
} finally {
    Remove-Item -Force $TempScript -ErrorAction SilentlyContinue
    Write-Host "`n>> Server stopped." -ForegroundColor Yellow
}
