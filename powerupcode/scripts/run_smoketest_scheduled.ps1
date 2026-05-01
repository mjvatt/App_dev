#requires -Version 5.1
<#
.SYNOPSIS
Run the Phase C smoke test and write its output to a dated log file.

.DESCRIPTION
Wrapper invoked by Windows Task Scheduler. Sets the working directory
to powerupcode/, runs scripts/smoketest_pipeline.py, and tees stdout +
stderr to logs/smoketest-YYYY-MM-DD.log. Exits with the smoke test's
exit code so the scheduled task's "Last Run Result" reflects pass/fail.

Prereqs at run time:
  - Docker Desktop running (Postgres on localhost:5434)
  - powerupcode/.env populated (ANTHROPIC_API_KEY, DATABASE_URL)
  - services/engine_core/ checked out locally
#>

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

$LogDir = Join-Path $RepoRoot "logs"
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir | Out-Null
}

$Stamp = Get-Date -Format "yyyy-MM-dd_HHmm"
$LogFile = Join-Path $LogDir "smoketest-$Stamp.log"

"=== smoke test run @ $(Get-Date -Format 'o') ===" | Out-File -FilePath $LogFile -Encoding utf8

# Pipe both streams into the log; preserve exit code.
& python "scripts/smoketest_pipeline.py" 2>&1 | Tee-Object -FilePath $LogFile -Append
$exit = $LASTEXITCODE

"=== exit code: $exit ===" | Out-File -FilePath $LogFile -Encoding utf8 -Append
exit $exit
