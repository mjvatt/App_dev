#requires -Version 5.1
<#
.SYNOPSIS
Stop the full PowerUpCode dev stack started by scripts/dev-up.ps1.
#>

$ErrorActionPreference = "Continue"

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

function Write-Step($msg) {
    Write-Host ""
    Write-Host "==> $msg" -ForegroundColor Cyan
}

function Stop-PortListener($port) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($conn in $conns) {
        try {
            taskkill /PID $conn.OwningProcess /F /T *> $null
        } catch {}
    }
}

Write-Step "Stopping backend on port 8000"
Stop-PortListener 8000

Write-Step "Stopping frontend on port 3001"
Stop-PortListener 3001

Write-Step "Stopping Postgres (docker compose)"
docker compose -f infra/docker/docker-compose.yml down

Write-Host ""
Write-Host "Stack is down." -ForegroundColor Green
