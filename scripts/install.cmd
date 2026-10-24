@ECHO OFF
SETLOCAL EnableDelayedExpansion

ECHO ==========================================================
ECHO   ColtLang Native Toolchain Installer for Windows (CMD)
ECHO ==========================================================

WHERE powershell >NUL 2>&1
IF %ERRORLEVEL% EQU 0 (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$script = [System.IO.Path]::Combine('%~dp0', 'install.ps1'); if (Test-Path $script) { & $script } else { irm https://coltlang.dev/install.ps1 | iex }"
  EXIT /B %ERRORLEVEL%
)

REM Fallback if powershell is not in PATH
SET "INSTALL_DIR=%LOCALAPPDATA%\Programs\colt\bin"
IF NOT EXIST "%INSTALL_DIR%" MKDIR "%INSTALL_DIR%"

ECHO Downloading Colt binary...
curl -fsSL "https://github.com/ColtLabs/ColtLang/releases/download/v0.2.0/colt-windows-x86_64.zip" -o "%TEMP%\colt.zip"
IF %ERRORLEVEL% NEQ 0 (
  ECHO Error: Failed to download Colt binary archive.
  EXIT /B 1
)

tar -xf "%TEMP%\colt.zip" -C "%INSTALL_DIR%"
IF EXIST "%TEMP%\colt.zip" DEL /Q "%TEMP%\colt.zip"

IF EXIST "%INSTALL_DIR%\colt.exe" (
  ECHO [OK] Installed colt.exe to %INSTALL_DIR%
  "%INSTALL_DIR%\colt.exe" version
  ECHO Please ensure %INSTALL_DIR% is in your PATH.
  EXIT /B 0
) ELSE (
  ECHO Error: Extraction did not produce colt.exe.
  EXIT /B 1
)
