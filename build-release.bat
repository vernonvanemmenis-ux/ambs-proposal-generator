@echo off
REM End-to-end release build: frontend → PyInstaller → Inno Setup.
REM Output: build\installer_out\AMBSProposalGen-Setup-<version>.exe

setlocal

pushd "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  python -m venv .venv || goto :error
)
call .venv\Scripts\activate.bat
pip install -q -r requirements.txt pyinstaller || goto :error

echo [1/3] Building frontend...
pushd frontend
if not exist node_modules call npm install || goto :error
call npm run build || goto :error
popd

echo [2/3] Running PyInstaller...
pyinstaller build\AMBSProposalGen.spec --noconfirm || goto :error

echo [3/3] Compiling Inno Setup installer...
where iscc >nul 2>nul
if errorlevel 1 (
  echo Inno Setup Compiler (iscc.exe) not on PATH.
  echo Install from https://jrsoftware.org/isdl.php and re-run this script.
  exit /b 1
)
iscc build\installer.iss || goto :error

echo.
echo Build complete. Installer in build\installer_out\
exit /b 0

:error
echo.
echo Release build failed.
exit /b 1
