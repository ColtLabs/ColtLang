@ECHO OFF
SETLOCAL

IF EXIST "%~dp0colt.exe" (
  "%~dp0colt.exe" %*
  EXIT /B %ERRORLEVEL%
)

IF EXIST "%~dp0colt-native.exe" (
  "%~dp0colt-native.exe" %*
  EXIT /B %ERRORLEVEL%
)

colt %*
EXIT /B %ERRORLEVEL%
