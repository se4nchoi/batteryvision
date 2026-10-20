# One-time setup: Python venv + backend deps, frontend deps + production build.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path backend\.venv)) { python -m venv backend\.venv }
backend\.venv\Scripts\python -m pip install --upgrade pip -q
backend\.venv\Scripts\python -m pip install -r backend\requirements.txt -q

Push-Location frontend
npm install --no-fund --no-audit
npm run build
Pop-Location

Write-Host "`nSetup complete. Start with:  .\start.ps1" -ForegroundColor Green
