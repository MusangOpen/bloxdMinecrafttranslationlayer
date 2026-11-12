@echo off
cd /d "%~dp0"
call npm start
set "EXIT_CODE=%ERRORLEVEL%"
echo.
if not "%EXIT_CODE%"=="0" (
    echo Bloxd Translation Layer exited with code %EXIT_CODE%.
    echo If this is EADDRINUSE, close the existing Node server first.
)
pause
