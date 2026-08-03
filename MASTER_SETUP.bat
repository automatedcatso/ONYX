@echo off
setlocal
title ONYX - Master Setup
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js 22 or newer is required.
  echo Download the LTS installer from https://nodejs.org/
  pause
  exit /b 1
)

for /f "tokens=1 delims=." %%V in ('node -p "process.versions.node"') do set "ONYX_NODE_MAJOR=%%V"
if %ONYX_NODE_MAJOR% LSS 22 (
  echo [ERROR] ONYX requires Node.js 22 or newer. Current version:
  node --version
  pause
  exit /b 1
)

if not exist ".env.local" if exist ".env.example" copy /y ".env.example" ".env.local" >nul

echo Installing locked ONYX dependencies...
call npm ci
if errorlevel 1 (
  echo [ERROR] Dependency installation failed. Check your connection and npm output above.
  pause
  exit /b 1
)

echo.
echo ONYX setup is complete.
echo Edit .env.local only when connecting Supabase, SMTP, or Gemini.
echo Run MASTER_RUN.bat to start the site.
pause
