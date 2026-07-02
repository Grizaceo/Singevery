# Build the Windows NSIS installer inside Docker (Wine + .NET 8).
# Output: apps/desktop/release/Singevery-Setup-*.exe
#
# Usage (from repo root):
#   .\scripts\docker-build.ps1
[CmdletBinding()]
param(
  [string]$ImageTag = 'singevery-builder'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$releaseDir = Join-Path $repoRoot 'apps\desktop\release'

Write-Host "[docker-build] Building image $ImageTag..." -ForegroundColor Cyan
docker build -t $ImageTag $repoRoot
if ($LASTEXITCODE -ne 0) {
  Write-Error "[docker-build] docker build failed (exit $LASTEXITCODE)."
  exit 1
}

New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null

Write-Host "[docker-build] Running package step (mounting release dir)..." -ForegroundColor Cyan
docker run --rm `
  -v "${releaseDir}:/project/apps/desktop/release" `
  $ImageTag
if ($LASTEXITCODE -ne 0) {
  Write-Error "[docker-build] docker run failed (exit $LASTEXITCODE)."
  exit 1
}

$installers = Get-ChildItem -Path $releaseDir -Filter 'Singevery-Setup-*.exe' -ErrorAction SilentlyContinue
if ($installers) {
  Write-Host "[docker-build] OK:" -ForegroundColor Green
  $installers | ForEach-Object { Write-Host "  $($_.FullName)" -ForegroundColor Green }
} else {
  Write-Warning "[docker-build] No Singevery-Setup-*.exe found in $releaseDir"
}
