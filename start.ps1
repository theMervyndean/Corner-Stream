# Corner Streams - start backend + frontend together (Windows PowerShell).
# Opens 2 new PowerShell windows, one per service. Close them to stop.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not (Test-Path "$root\backend\.env"))  { Write-Host "Run .\setup.ps1 first."; exit 1 }
if (-not (Test-Path "$root\frontend\.env")) { Write-Host "Run .\setup.ps1 first."; exit 1 }

Write-Host "Starting backend on http://localhost:8001 ..."
Start-Process powershell -ArgumentList "-NoExit","-Command","cd '$root\backend'; .\venv\Scripts\Activate.ps1; uvicorn server:app --reload --host 0.0.0.0 --port 8001"

Start-Sleep -Seconds 3

Write-Host "Starting frontend on http://localhost:3000 ..."
Start-Process powershell -ArgumentList "-NoExit","-Command","cd '$root\frontend'; yarn start"

Write-Host ""
Write-Host "Both services launched in separate windows. Open http://localhost:3000"
Write-Host "Close the two windows to stop them."
