<#
.SYNOPSIS
  Installs or updates the Colt toolchain CLI into the user's system PATH.
#>
param(
  [string]$TargetDir = "$env:USERPROFILE\.cargo\bin"
)

$ErrorActionPreference = "Stop"

Write-Host "Installing ColtLang CLI toolchain to $TargetDir..." -ForegroundColor Cyan

if (-not (Test-Path $TargetDir)) {
  New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
}

$RepoRoot = Split-Path -Parent $PSScriptRoot
$NativeExe = Join-Path $RepoRoot "target\release\colt.exe"
if (-not (Test-Path $NativeExe)) {
  $NativeExe = Join-Path $RepoRoot "target\debug\colt.exe"
}

if (Test-Path $NativeExe) {
  Copy-Item $NativeExe (Join-Path $TargetDir "colt-native.exe") -Force
  Write-Host "  [OK] Installed colt-native.exe" -ForegroundColor Green
} else {
  Write-Warning "Native binary colt.exe not found in target/. Using node/tsx runtime."
}

Copy-Item (Join-Path $PSScriptRoot "colt.cmd") (Join-Path $TargetDir "colt.cmd") -Force
Copy-Item (Join-Path $PSScriptRoot "colt.ps1") (Join-Path $TargetDir "colt.ps1") -Force
Write-Host "  [OK] Installed colt.cmd and colt.ps1" -ForegroundColor Green

Write-Host "Colt CLI installation complete! Verifying..." -ForegroundColor Cyan
& (Join-Path $TargetDir "colt.ps1") version
Write-Host "You can now run 'colt <command>' or 'colt run <file.colt>' from any terminal!" -ForegroundColor Green
