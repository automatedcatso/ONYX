@echo off
setlocal
title ONYX - Production Verification
cd /d "%~dp0"

if not exist "node_modules" (
  echo [ERROR] Dependencies are missing. Run MASTER_SETUP.bat first.
  pause
  exit /b 1
)

if not exist ".env.local" (
  echo [ERROR] .env.local is missing. Copy .env.example and enter the values you intend to deploy.
  pause
  exit /b 1
)

echo Running source, repository, and migration checks...
call npm test
if errorlevel 1 goto :failed

echo Validating production environment values...
call npm run verify:env -- --production
if errorlevel 1 goto :failed

echo Running lint, TypeScript, and production build...
call npm run lint
if errorlevel 1 goto :failed
call npm run typecheck
if errorlevel 1 goto :failed
call npm run build
if errorlevel 1 goto :failed

echo.
echo [PASS] ONYX is ready for the documented deployment procedure.
pause
exit /b 0

:failed
echo.
echo [ERROR] Production verification failed. Do not deploy until the issue above is corrected.
pause
exit /b 1
