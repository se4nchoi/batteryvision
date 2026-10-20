# Start BatteryVision on http://localhost:8000 (API + built dashboard on one port).
#   .\start.ps1               auto: LIVE if models\model.xml loads, else DEMO
#   .\start.ps1 -Mode demo    force demo mode
param([ValidateSet("auto", "demo", "live")][string]$Mode = "auto", [int]$Port = 8000)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path backend\.venv\Scripts\python.exe)) { throw "Run .\setup.ps1 first." }
if (-not (Test-Path frontend\dist\index.html)) {
    Push-Location frontend; npm run build; Pop-Location
}
$env:BV_MODE = $Mode
Write-Host "BatteryVision -> http://localhost:$Port  (mode: $Mode)" -ForegroundColor Cyan
backend\.venv\Scripts\python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port $Port
