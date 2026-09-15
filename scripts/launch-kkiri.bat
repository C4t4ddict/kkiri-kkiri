@echo off
setlocal EnableExtensions
chcp 65001 >nul
title KKIRI KKIRI Launcher

for %%I in ("%~dp0..") do set "PROJECT_DIR=%%~fI"
set "WEB_URL=http://localhost:5173"

echo Using project: %PROJECT_DIR%

cd /d "%PROJECT_DIR%" 2>nul
if errorlevel 1 (
  echo [ERROR] Project folder not found:
  echo         %PROJECT_DIR%
  pause
  exit /b 1
)

if not exist "package.json" (
  echo [ERROR] package.json is missing from the project folder.
  pause
  exit /b 1
)

where node.exe >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or is not available in PATH.
  echo         Install Node.js LTS and run this file again.
  pause
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm is not available in PATH.
  pause
  exit /b 1
)

if /i "%~1"=="--check" goto check_only

call :ensure_dependencies "." "root"
if errorlevel 1 goto dependency_error
call :ensure_dependencies "server" "server"
if errorlevel 1 goto dependency_error
call :ensure_dependencies "web" "web"
if errorlevel 1 goto dependency_error

echo Checking the local MySQL database...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_DIR%\scripts\start-local-mysql.ps1"
if errorlevel 1 goto database_error

echo Preparing the local database account and schema...
set "ALLOW_DEMO_DATA=true"
call npm --prefix server run db:bootstrap
set "ALLOW_DEMO_DATA="
if errorlevel 1 goto database_error

call :web_is_ready
if not errorlevel 1 (
  echo KKIRI KKIRI is already running. Opening Chrome...
  call :open_browser
  exit /b 0
)

echo Starting the API, database check, and web app...
echo The browser will open automatically when the app is ready.
echo Keep this window open while using the app.
echo.

start "" /b powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%PROJECT_DIR%\scripts\open-web-when-ready.ps1" -Url "%WEB_URL%" -TimeoutSeconds 120

call npm run web
if errorlevel 1 (
  echo.
  echo [ERROR] The app could not be started.
  echo         Check the message above. API log: %TEMP%\kkiri-api-server.log
  pause
  exit /b 1
)
exit /b 0

:check_only
if not exist "node_modules" goto check_missing_dependencies
if not exist "server\node_modules" goto check_missing_dependencies
if not exist "web\node_modules" goto check_missing_dependencies
echo CHECK_OK: Project path, Node.js, npm, and dependencies are ready.
exit /b 0

:check_missing_dependencies
echo [ERROR] One or more dependency folders are missing.
exit /b 1

:ensure_dependencies
if exist "%~1\node_modules" exit /b 0
echo Installing missing %~2 dependencies...
if "%~1"=="." (
  call npm install
) else (
  call npm --prefix "%~1" install
)
if errorlevel 1 exit /b 1
exit /b 0

:web_is_ready
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { $response=Invoke-WebRequest -UseBasicParsing -Uri '%WEB_URL%' -TimeoutSec 2; if($response.StatusCode -ge 200){ exit 0 } } catch {}; exit 1" >nul 2>nul
exit /b %errorlevel%

:open_browser
set "CHROME_PATH="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME_PATH=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined CHROME_PATH if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME_PATH=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined CHROME_PATH if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "CHROME_PATH=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if defined CHROME_PATH (
  start "" "%CHROME_PATH%" "%WEB_URL%"
) else (
  start "" "%WEB_URL%"
)
exit /b 0

:dependency_error
echo.
echo [ERROR] Dependency installation failed.
pause
exit /b 1

:database_error
echo.
echo [ERROR] The local MySQL database could not be started.
echo         Check that MySQL Server 8.0 is installed.
pause
exit /b 1
