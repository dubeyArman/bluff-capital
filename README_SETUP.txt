===============================================================================
               BLUFF CAPITAL — PORTABLE EVENT PACKAGE
===============================================================================

This package contains everything needed to run Bluff Capital on ANY Windows 
laptop for live events (~300 participants).

CONTENTS:
-------------------------------------------------------------------------------
1. START_GAME.bat              -> Main 1-Click Game Launcher
2. Allow_Firewall_Port_3000.bat -> Firewall tool for Wi-Fi phone access
3. node.exe                    -> Bundled portable Node.js (Zero install needed!)
4. node_modules/               -> All pre-installed server & websocket libraries
5. server/server.js            -> Game backend engine & state management
6. public/                     -> Player web app, Host Dashboard & Stage Projector

HOW TO RUN ON ANOTHER LAPTOP:
-------------------------------------------------------------------------------
STEP 1: Copy this entire folder to the other laptop (Desktop or C:\ drive).
STEP 2: Make sure the laptop is connected to the event Wi-Fi network.
STEP 3: Double-click "START_GAME.bat".
        - The server starts automatically using the bundled portable Node.js.
        - The Host Console & Stage Projector will open in your web browser.
        - The command prompt window will display the Wi-Fi IP for phones:
          e.g. http://192.168.1.50:3000
STEP 4: Share that URL (or project the Stage QR code) for participants to join!

IF PHONES CANNOT CONNECT:
-------------------------------------------------------------------------------
Right-click "Allow_Firewall_Port_3000.bat" and select "Run as administrator".
This ensures Windows Firewall allows inbound connections on Port 3000.

DEFAULT EVENT CREDENTIALS:
-------------------------------------------------------------------------------
Host Dashboard:  http://localhost:3000/host
Host Password:   bluffcapital2026
Stage Projector: http://localhost:3000/projector
===============================================================================
