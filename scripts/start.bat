@echo off
setlocal
cd /d "%~dp0\.."
where py >nul 2>nul
if %errorlevel% equ 0 (
  py -3 scripts\start.py %*
) else (
  python scripts\start.py %*
)
if errorlevel 1 (
  echo.
  echo Atlas could not start. Read the message above and docs\SETUP.md.
  echo If Python was not found, install Python 3.11 or newer and enable Add Python to PATH.
  pause
)
endlocal
