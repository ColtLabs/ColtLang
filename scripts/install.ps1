<#
.SYNOPSIS
  Official ColtLang Installer for Windows (PowerShell)
  Installs the native 'colt' toolchain executable without needing Node, npm, or Rust.
.DESCRIPTION
  Downloads the verified release binary from GitHub Releases, checks SHA-256 integrity,
  installs it to the user's directory, and registers PATH.
.EXAMPLE
  irm https://coltlang.dev/install.ps1 | iex
#>
param(
  [string]$Version = "latest",
  [string]$TargetDir = "$env:LOCALAPPDATA\Programs\colt\bin"
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  ColtLang Native Toolchain Installer for Windows" -ForegroundColor Cyan
Write-Host "  Declarative Multi-Paradigm Data Language" -ForegroundColor DarkGray
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Architecture Detection
$Arch = if ([System.Environment]::Is64BitOperatingSystem) { "x86_64" } else { "x86" }
if ($Arch -ne "x86_64") {
  Write-Error "Unsupported architecture: $Arch. Colt currently provides official binaries for x86_64 Windows."
  exit 1
}

# 2. Check for Local Development Build first (if run inside repository)
$RepoRoot = Split-Path -Parent $PSScriptRoot
$LocalExe = Join-Path $RepoRoot "target\release\colt.exe"
if (-not (Test-Path $LocalExe)) {
  $LocalExe = Join-Path $RepoRoot "target\debug\colt.exe"
}

if (-not (Test-Path $TargetDir)) {
  New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
}

$TargetExe = Join-Path $TargetDir "colt.exe"

if ((Test-Path $LocalExe) -and (-not $env:COLT_FORCE_DOWNLOAD)) {
  Write-Host "Found local compiled binary at $LocalExe. Installing to $TargetDir..." -ForegroundColor Green
  Copy-Item -Path $LocalExe -Destination $TargetExe -Force
} else {
  # 3. Remote Download & Verification Flow
  $Repo = "ColtLabs/ColtLang"
  $ReleaseTag = if ($Version -eq "latest") { "v0.2.0" } else { $Version }
  $AssetFileName = "colt-windows-x86_64.zip"
  $BaseDownloadUrl = "https://github.com/$Repo/releases/download/$ReleaseTag"
  $DownloadUrl = "$BaseDownloadUrl/$AssetFileName"
  $ChecksumUrl = "$BaseDownloadUrl/SHA256SUMS.txt"

  $TempDir = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "colt-installer-" + [System.Guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $TempDir -Force | Out-Null

  $ArchiveFile = Join-Path $TempDir $AssetFileName
  $ChecksumFile = Join-Path $TempDir "SHA256SUMS.txt"

  try {
    Write-Host "Fetching Colt release $ReleaseTag from GitHub..." -ForegroundColor Cyan
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13

    try {
      Invoke-WebRequest -Uri $DownloadUrl -OutFile $ArchiveFile -UseBasicParsing
      Invoke-WebRequest -Uri $ChecksumUrl -OutFile $ChecksumFile -UseBasicParsing
    } catch {
      Write-Warning "Could not download remote release archive from GitHub ($DownloadUrl)."
      if (Test-Path $LocalExe) {
        Write-Host "Falling back to local binary $LocalExe..." -ForegroundColor Yellow
        Copy-Item -Path $LocalExe -Destination $TargetExe -Force
      } else {
        throw "Failed to download $AssetFileName and no local binary found. Please check internet access."
      }
    }

    if (Test-Path $ArchiveFile) {
      # 4. SHA-256 Checksum Verification
      Write-Host "Verifying SHA-256 checksum integrity..." -ForegroundColor Cyan
      $ComputedHash = (Get-FileHash -Path $ArchiveFile -Algorithm SHA256).Hash.ToLowerInvariant()
      $ChecksumContent = Get-Content $ChecksumFile -Raw
      
      $MatchFound = $false
      foreach ($line in $ChecksumContent -split "`r?`n") {
        if ($line -match "^([a-fA-F0-9]{64})\s+.*$AssetFileName") {
          $ExpectedHash = $matches[1].ToLowerInvariant()
          if ($ComputedHash -eq $ExpectedHash) {
            $MatchFound = $true
            break
          } else {
            throw "Security alert: SHA256 checksum mismatch for $AssetFileName! Expected: $ExpectedHash, Found: $ComputedHash"
          }
        }
      }

      if (-not $MatchFound) {
        Write-Warning "Checksum entry for $AssetFileName not found in SHA256SUMS.txt. Continuing cautiously."
      } else {
        Write-Host "  [OK] SHA-256 checksum verified ($ComputedHash)" -ForegroundColor Green
      }

      # 5. Extract Archive
      Write-Host "Extracting Colt binary..." -ForegroundColor Cyan
      Expand-Archive -Path $ArchiveFile -DestinationPath $TempDir -Force
      $ExtractedExe = Get-ChildItem -Path $TempDir -Filter "colt.exe" -Recurse | Select-Object -First 1
      if (-not $ExtractedExe) {
        throw "Archive did not contain colt.exe binary."
      }
      Copy-Item -Path $ExtractedExe.FullName -Destination $TargetExe -Force
    }
  } finally {
    if (Test-Path $TempDir) {
      Remove-Item -Path $TempDir -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

# 6. User PATH Registration
$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($UserPath -notlike "*$TargetDir*") {
  Write-Host "Registering $TargetDir in user PATH environment variable..." -ForegroundColor Cyan
  $NewPath = "$UserPath;$TargetDir".TrimStart(';')
  [Environment]::SetEnvironmentVariable("Path", $NewPath, "User")
  $env:Path = "$env:Path;$TargetDir"
  Write-Host "  [OK] PATH updated successfully." -ForegroundColor Green
} else {
  Write-Host "  [OK] $TargetDir is already in user PATH." -ForegroundColor Green
}

# 7. Post-Installation Verification
Write-Host "`nVerifying Colt installation..." -ForegroundColor Cyan
try {
  $VerOutput = & $TargetExe version
  Write-Host "  [OK] Installed executable: $TargetExe" -ForegroundColor Green
  Write-Host "  [OK] Verified version:     $VerOutput" -ForegroundColor Green
} catch {
  Write-Error "Verification failed: Could not invoke installed colt.exe at $TargetExe: $_"
  exit 1
}

Write-Host "`nInstallation successful! Quick Start:" -ForegroundColor Green
Write-Host "  colt                         # Open interactive terminal workspace" -ForegroundColor White
Write-Host "  colt --help                  # View command reference" -ForegroundColor White
Write-Host "  colt doctor                  # Verify database connections & environment" -ForegroundColor White
Write-Host "  colt run library.colt        # Execute a Colt program" -ForegroundColor White
Write-Host "`nNote: If this was a fresh terminal, restart your shell to pick up the updated PATH.`n" -ForegroundColor DarkGray
