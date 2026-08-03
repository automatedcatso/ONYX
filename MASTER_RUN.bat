@echo off
setlocal
title ONYX - Development Server
cd /d "%~dp0"

if not exist "node_modules" (
  echo Dependencies are missing. Running MASTER_SETUP.bat first...
  call MASTER_SETUP.bat
  if errorlevel 1 exit /b 1
)

set "ONYX_DEV_URL=http://127.0.0.1:3010"
set "NEXT_PUBLIC_APP_URL=%ONYX_DEV_URL%"

echo Starting ONYX at %ONYX_DEV_URL%
echo This isolated origin avoids cached apps previously run on localhost:3000.
echo Press Ctrl+C to stop the server.
start "" "%ONYX_DEV_URL%"
call npm run dev
pause
