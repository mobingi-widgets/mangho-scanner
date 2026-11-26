@echo off
rem Mangho scanner (read-only overlay). Keep this file ASCII: cmd reads it in the system code page.
setlocal
cd /d "%~dp0"
if exist "node_modules\electron\dist\electron.exe" goto run
echo First run: installing Electron...
call npm install --no-audit --no-fund
if errorlevel 1 goto fail
call node node_modules\electron\install.js
if not exist "node_modules\electron\dist\electron.exe" goto fail
:run
start "" "node_modules\electron\dist\electron.exe" .
exit /b 0
:fail
echo Electron install failed. Install Node.js LTS from nodejs.org and try again.
pause
exit /b 1
