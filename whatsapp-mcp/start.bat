@echo off
title WhatsApp MCP Bot
color 0A

echo.
echo  ============================================
echo   WhatsApp MCP Bot - Direct Connection
echo  ============================================
echo.

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Install from https://nodejs.org
    pause
    exit /b 1
)

:: Go to script directory
cd /d "%~dp0"

:: Install dependencies if node_modules missing
if not exist "node_modules" (
    echo [SETUP] Installing dependencies - first run may take 1-2 minutes...
    echo.
    npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed
        pause
        exit /b 1
    )
    echo.
    echo [OK] Dependencies installed!
    echo.
)

:: Show instructions
echo  INSTRUCTIONS:
echo  1. When a QR code appears, open WhatsApp on your phone
echo  2. Go to: Settings ^> Linked Devices ^> Link a Device
echo  3. Scan the QR code
echo  4. Wait for "Connected!" message
echo  5. The MCP server is now running on stdio
echo.
echo  To use as MCP tool, add this to your Claude/MCP config:
echo  {
echo    "mcpServers": {
echo      "whatsapp": {
echo        "command": "node",
echo        "args": ["%~dp0src\index.js"]
echo      }
echo    }
echo  }
echo.
echo  ============================================
echo  Starting server... (Ctrl+C to stop)
echo  ============================================
echo.

node src/index.js

echo.
echo [Server stopped]
pause
