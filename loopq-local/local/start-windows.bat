@echo off
cd /d "%~dp0"
where py >nul 2>&1
if errorlevel 1 (
  echo Python が必要です。公式 python.org よりインストールしてください。
  pause
  exit /b 1
)
py -m pip install -r requirements.txt
if errorlevel 1 (echo 依存パッケージの準備に失敗しました。 & pause & exit /b 1)
py server.py
pause
