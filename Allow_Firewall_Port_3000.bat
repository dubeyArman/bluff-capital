@echo off
title Open Windows Firewall for Bluff Capital
color 0E

echo ====================================================================
echo   BLUFF CAPITAL - FIREWALL ACCESS ENABLER
echo ====================================================================
echo.
echo This script opens Port 3000 so students' phones on the same Wi-Fi
echo can connect to this laptop smoothly.
echo.
echo Requesting administrator privileges...
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Requesting Admin Permissions...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo [*] Adding Inbound Rule for Port 3000 (TCP)...
netsh advfirewall firewall add rule name="Bluff Capital Game (Port 3000)" dir=in action=allow protocol=TCP localport=3000

echo.
echo ====================================================================
echo [OK] Firewall rule added successfully!
echo Students can now connect from their phones via Wi-Fi.
echo ====================================================================
echo.
pause
