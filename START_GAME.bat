@echo off
title BLUFF CAPITAL - Live Event Server
color 0A

cd /d "%~dp0"

echo ===============================================================================
echo                BLUFF CAPITAL - LIVE EVENT LAUNCHER
echo ===============================================================================
echo.

:: 1. Detect Node.js runtime (bundled portable node.exe or system node)
set "NODE_CMD="
if exist "%~dp0node.exe" (
    set "NODE_CMD=%~dp0node.exe"
    echo [OK] Using bundled portable Node.js runtime.
) else (
    where node >nul 2>&1
    if %errorlevel% equ 0 (
        set "NODE_CMD=node"
        echo [OK] Using system Node.js.
    ) else (
        echo [ERROR] Node.js was not found on this laptop!
        echo.
        echo Please ensure node.exe is present in this folder, or install Node from:
        echo https://nodejs.org/
        echo.
        pause
        exit /b 1
    )
)

:: 2. Check dependencies
if not exist "%~dp0node_modules" (
    echo [*] Installing required event libraries, please wait...
    call npm install --omit=dev
    if %errorlevel% neq 0 (
        echo [!] Warning: npm install failed.
    )
) else (
    echo [OK] All game libraries verified.
)

:: 3. Detect Wi-Fi / LAN IP Address for mobile access
set "LOCAL_IP=127.0.0.1"
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address"') do (
    for /f "tokens=*" %%b in ("%%a") do (
        set "LOCAL_IP=%%b"
    )
)

echo.
echo ===============================================================================
echo   EVENT NETWORK ACCESS
echo ===============================================================================
echo   Laptop Host Console: http://localhost:3000/host
echo   Stage Projector View: http://localhost:3000/projector
echo   Student Phones:      http://%LOCAL_IP%:3000
echo.
echo   * Ensure student phones are connected to the SAME Wi-Fi as this laptop!
echo ===============================================================================
echo.

:: 4. Check if server is already running on Port 3000
netstat -ano | findstr ":3000 " | findstr "LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Bluff Capital server is ALREADY RUNNING on Port 3000!
    echo [*] Opening Host Control Center and Stage Projector...
    start "" "http://localhost:3000/host"
    start "" "http://localhost:3000/projector"
    echo.
    echo ===============================================================================
    echo   The game is live! You can close this launcher window anytime.
    echo ===============================================================================
    echo.
    pause
    exit /b 0
)

:: 5. Open browser tabs
echo [*] Opening Host Control Center and Stage Projector...
start "" "http://localhost:3000/host"
start "" "http://localhost:3000/projector"

:: 6. Launch server in this window
echo [*] Launching Bluff Capital Server (Port 3000)...
echo [*] Keep this command window OPEN during your entire event.
echo.
"%NODE_CMD%" server/server.js

echo.
echo Bluff Capital Server has stopped.
pause
