@echo off
setlocal
cd /d "%~dp0"
title Orbit PC Monitoring

echo.
echo ========================================
echo        ORBIT PC MONITORING
echo ========================================
echo.
echo Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed.
  echo Install Node.js 22 or newer from https://nodejs.org/
  echo Then double-click this file again.
  pause
  exit /b 1
)

echo Installing Orbit packages if needed...
call corepack pnpm install --frozen-lockfile
if errorlevel 1 (
  echo Package installation failed.
  pause
  exit /b 1
)

echo.
echo Starting Orbit...
echo Keep this window open while using Orbit.
echo Open http://localhost:3000 after the server starts.
echo.
set "NODE_ENV=development"
call corepack pnpm exec tsx watch server/_core/index.ts

echo.
echo Orbit has stopped. Press any key to close this window.
pause >nul
