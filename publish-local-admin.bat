@echo off
REM Self-elevating wrapper for publish-local.py.
REM
REM Writing the new payload into C:\Program Files\...\_internal\payload\ needs
REM admin. This script detects elevation and, if not elevated, relaunches
REM itself via PowerShell with -Verb RunAs so Windows shows the UAC prompt.

setlocal

net session >nul 2>&1
if %errorLevel% NEQ 0 (
  echo Not elevated. Requesting admin via UAC...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList '%*' -Verb RunAs"
  exit /b 0
)

pushd "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo No .venv found. Run run-dev.bat at least once to create one.
  pause
  exit /b 1
)

echo Running publish-local.py with admin rights...
echo.
.venv\Scripts\python.exe publish-local.py %*
set ec=%errorlevel%

echo.
if %ec% NEQ 0 (
  echo publish-local.py exited with code %ec%.
) else (
  echo Done. Close + reopen the AMBS Proposal Generator app to see the new version.
)
echo.
pause
exit /b %ec%
