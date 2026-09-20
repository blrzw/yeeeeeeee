@echo off
:: Runs the Orbit agent pointing at YOUR LOCAL server (localhost:3000)
:: instead of the remote Manus server.
:: Run this on any Windows PC that should show up in your local dashboard.

set SERVER=http://localhost:3000
set AGENT_ID=LOCAL-PC-%COMPUTERNAME%

echo.
echo =============================================
echo   Orbit Agent — Local Development Mode
echo =============================================
echo   Server : %SERVER%
echo   Agent  : %AGENT_ID%
echo =============================================
echo.

:: Try the pre-built EXE from the agent folder first, then public folder
if exist "%~dp0agent\orbit-monitor-screen.exe" (
    start "" "%~dp0agent\orbit-monitor-screen.exe" %SERVER% %AGENT_ID%
    echo Agent launched. Check your dashboard at http://localhost:3000
) else if exist "%~dp0client\public\orbit-monitor-screen.exe" (
    start "" "%~dp0client\public\orbit-monitor-screen.exe" %SERVER% %AGENT_ID%
    echo Agent launched. Check your dashboard at http://localhost:3000
) else (
    echo ERROR: orbit-monitor-screen.exe not found.
    echo Expected at: %~dp0agent\orbit-monitor-screen.exe
    echo Build the agent first or copy the EXE there.
)

echo.
pause
