@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Cursor Sobriety Check needs Node.js, which is not installed yet.
  echo.
  echo 1. Open https://nodejs.org
  echo 2. Download the LTS version and install it.
  echo 3. Double-click INSTALL.bat again.
  echo.
  pause
  exit /b 1
)

echo.
echo Installing Cursor Sobriety Check...
echo.
node cli.mjs install
echo.
pause
