@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install it from https://nodejs.org then try again.
  pause
  exit /b 1
)
echo This removes xcursorfatiguex from Cursor. Your private log is kept.
echo.
node cli.mjs uninstall
echo.
pause
