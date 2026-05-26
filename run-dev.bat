@echo off
REM Dev runner: starts the FastAPI backend on 8765 and the Vite dev server on 5173.
REM Open http://localhost:5173 in your browser.

setlocal

pushd "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo Creating virtualenv...
  python -m venv .venv || goto :error
)

call .venv\Scripts\activate.bat

echo Installing Python deps...
pip install -q -r requirements.txt || goto :error

echo Starting FastAPI on :8765 (new window)
start "AMBS Backend" cmd /k "call .venv\Scripts\activate.bat && set AMBS_PORT=8765 && set AMBS_NO_BROWSER=1 && python -m backend.main"

echo Starting Vite dev server on :5173 (new window)
pushd frontend
if not exist node_modules (
  echo Installing npm deps...
  call npm install || goto :error
)
start "AMBS Frontend" cmd /k "npm run dev"
popd

echo.
echo Both servers launching. Open http://localhost:5173
exit /b 0

:error
echo.
echo Dev launcher failed. See the log above.
exit /b 1
