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

echo Running ONYX source and migration checks...
call npm test
if errorlevel 1 (
  echo [ERROR] Source validation failed. Review the output above before running or deploying.
  pause
  exit /b 1
)

echo.
echo ONYX setup and source validation are complete.
echo Edit .env.local when connecting Supabase, SMTP, or Gemini.
echo Run MASTER_VERIFY_DEPLOYMENT.bat before a production release.
echo Run MASTER_RUN.bat to start the site.
pause
