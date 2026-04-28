#requires -Version 5.1
<#
.SYNOPSIS
Bring up the full PowerUpCode dev stack: Docker Postgres, Alembic migrations,
FastAPI backend, and Next.js frontend.

.DESCRIPTION
Idempotent. Safe to run when services are already up. Backend and frontend
each launch in their own terminal window so logs are visible and Ctrl+C
stops them cleanly. Run scripts/dev-down.ps1 to tear everything down.
#>

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

function Write-Step($msg) {
    Write-Host ""
    Write-Host "==> $msg" -ForegroundColor Cyan
}

function Resolve-Alembic {
    $cmd = Get-Command alembic -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    $userBase = (& python -c "import site; print(site.USER_BASE)").Trim()
    $candidate = Join-Path $userBase "Python313\Scripts\alembic.exe"
    if (Test-Path $candidate) { return $candidate }

    throw "Could not locate alembic. Install with: pip install alembic"
}

function Resolve-Uvicorn {
    $cmd = Get-Command uvicorn -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    $userBase = (& python -c "import site; print(site.USER_BASE)").Trim()
    $candidate = Join-Path $userBase "Python313\Scripts\uvicorn.exe"
    if (Test-Path $candidate) { return $candidate }

    throw "Could not locate uvicorn. Install with: pip install 'uvicorn[standard]'"
}

Write-Step "Checking Docker"
try {
    docker info --format "{{.ServerVersion}}" *> $null
    if ($LASTEXITCODE -ne 0) { throw "docker info failed" }
} catch {
    Write-Host "Docker is not running. Start Docker Desktop and re-run this script." -ForegroundColor Red
    exit 1
}

Write-Step "Starting Postgres (docker compose)"
docker compose -f infra/docker/docker-compose.yml up -d
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Step "Waiting for Postgres to accept connections"
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    docker exec docker-db-1 pg_isready -U postgres *> $null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 1
}
if (-not $ready) {
    Write-Host "Postgres did not become ready within 30s." -ForegroundColor Red
    exit 1
}

Write-Step "Running Alembic migrations"
$alembic = Resolve-Alembic
& $alembic upgrade head
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Step "Launching FastAPI backend (port 8000)"
$uvicorn = Resolve-Uvicorn
Start-Process -FilePath "powershell.exe" -ArgumentList @(
    "-NoExit",
    "-Command",
    "`$Host.UI.RawUI.WindowTitle = 'PowerUpCode Backend'; Set-Location '$RepoRoot'; & '$uvicorn' api.main:app --port 8000 --reload"
)

Write-Step "Launching Next.js frontend (port 3001)"
Start-Process -FilePath "powershell.exe" -ArgumentList @(
    "-NoExit",
    "-Command",
    "`$Host.UI.RawUI.WindowTitle = 'PowerUpCode Frontend'; Set-Location '$RepoRoot'; npm run dev"
)

Write-Host ""
Write-Host "Stack is up:" -ForegroundColor Green
Write-Host "  Postgres : localhost:5434"
Write-Host "  Backend  : http://localhost:8000"
Write-Host "  Frontend : http://localhost:3001"
Write-Host ""
Write-Host "Tear down with: scripts/dev-down.ps1"
