# Corner Streams - one-command local setup (Windows PowerShell).
# Run from the repo root in PowerShell:  .\setup.ps1
# If you get an execution policy error, run once:
#   Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned

$ErrorActionPreference = "Stop"

function Ok($msg)   { Write-Host "OK  $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "!   $msg" -ForegroundColor Yellow }
function Die($msg)  { Write-Host "ERR $msg" -ForegroundColor Red; exit 1 }

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Host "================================"
Write-Host " Corner Streams - local setup"
Write-Host "================================"

# 1. Prerequisites
foreach ($cmd in @("python","node","yarn")) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    Die "$cmd not found. Install it before running setup.ps1"
  }
}
$nodeMajor = [int]((node -v).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 18) { Die "Node $nodeMajor detected; need 18+" }
Ok "Python $(python --version), Node $(node -v), Yarn $(yarn -v)"

# 2. backend/.env
if (Test-Path "$root\backend\.env") {
  Ok "backend\.env already exists"
} else {
  if (-not (Test-Path "$root\backend\.env.example")) { Die "backend\.env.example missing" }
  $jwt = python -c "import secrets;print(secrets.token_urlsafe(48))"
  (Get-Content "$root\backend\.env.example") `
    -replace "replace_me_with_a_long_random_string_at_least_48_chars", $jwt `
    | Set-Content "$root\backend\.env"
  Ok "backend\.env created (JWT_SECRET auto-generated)"
  Warn "Default super admin password is 'Super@123' - change ADMIN_PASSWORD in backend\.env before sharing."
}

# 3. frontend/.env
if (Test-Path "$root\frontend\.env") {
  Ok "frontend\.env already exists"
} else {
  Copy-Item "$root\frontend\.env.example" "$root\frontend\.env"
  Ok "frontend\.env created"
}

# 4. Backend deps
Set-Location "$root\backend"
if (-not (Test-Path ".\venv")) {
  python -m venv venv
  Ok "Python virtualenv created at backend\venv"
}
.\venv\Scripts\python.exe -m pip install --quiet --upgrade pip
.\venv\Scripts\pip.exe install --quiet -r requirements.txt
Ok "Backend dependencies installed"

# 5. Frontend deps
Set-Location "$root\frontend"
yarn install --silent
Ok "Frontend dependencies installed"

Set-Location $root

Write-Host ""
Write-Host "================================"
Write-Host " Setup complete!" -ForegroundColor Green
Write-Host "================================"
Write-Host ""
Write-Host "Next: start both servers with one command:"
Write-Host "    .\start.ps1"
Write-Host ""
Write-Host "Or manually (in two separate PowerShell windows):"
Write-Host "  Window A:  cd backend; .\venv\Scripts\Activate.ps1; uvicorn server:app --reload --port 8001"
Write-Host "  Window B:  cd frontend; yarn start"
Write-Host ""
Write-Host "Then open  http://localhost:3000"
Write-Host ""
Write-Host "Demo logins:"
Write-Host "  super@cornerstreams.com  /  Super@123    (or whatever ADMIN_PASSWORD you set)"
Write-Host "  admin@demo.school        /  Admin@123"
Write-Host "  teacher@demo.school      /  Teacher@123"
Write-Host "  parent@demo.school       /  Parent@123"
Write-Host "  adaeze@demo.school       /  Student@123"
