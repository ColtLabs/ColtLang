@ECHO OFF
SETLOCAL

IF "%~1"=="" (
  "%~dp0colt-native.exe" --help
  EXIT /B %ERRORLEVEL%
)

IF /I "%~1"=="run" (
  node --import tsx "E:\Projects\ColtLang\packages\cli\src\main.ts" %*
  EXIT /B %ERRORLEVEL%
)

"%~dp0colt-native.exe" %*
EXIT /B %ERRORLEVEL%
