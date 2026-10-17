@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   LoopQ — Windows local ChatGPT verification
echo   AI charges are never switched to an operator-paid API.
echo.
where py >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Python launcher was not found. Install Python 3.11+ from python.org.
  echo During installation, enable the Python launcher.
  pause
  exit /b 1
)
py -3 -c "import sys;sys.exit(0 if sys.version_info >= (3,11) else 1)" >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Python 3.11 or newer is required.
  pause
  exit /b 1
)
if not exist ".venv\Scripts\python.exe" (
  echo [SETUP] Creating a private Python environment...
  py -3 -m venv .venv
  if errorlevel 1 goto error
)
echo [SETUP] Installing required packages inside LoopQ environment...
".venv\Scripts\python.exe" -m pip install --disable-pip-version-check -r requirements.txt
if errorlevel 1 goto error
echo [READY] Keep this window open while testing LoopQ.
echo [READY] A browser should open at http://127.0.0.1:8765/loopq/
echo [PRIVACY] Never share any ChatGPT sign-in tokens or secrets.
".venv\Scripts\python.exe" server.py
if errorlevel 1 goto error
goto end
:error
echo.
echo [ERROR] LoopQ could not start. Copy the error message (not any tokens).
pause
exit /b 1
:end
pause
