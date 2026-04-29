@echo off
title WhatsApp MCP Bot
color 0A

:: Go to script directory
cd /d "%~dp0"

:MENU
cls
echo.
echo  =====================================================
echo        WhatsApp MCP Bot - Direct Connection
echo  =====================================================
echo.
echo   Mode 1: MCP Server  (for Claude Desktop / MCP clients)
echo   Mode 2: AI Bot      (standalone - replies automatically)
echo   Mode 3: Install / Reinstall dependencies
echo   Mode 4: Reset session (delete saved QR/auth)
echo   Mode 5: Exit
echo.
echo  =====================================================
set /p CHOICE=" Choose [1-5]: "

if "%CHOICE%"=="1" goto MCP_SERVER
if "%CHOICE%"=="2" goto AI_BOT
if "%CHOICE%"=="3" goto INSTALL
if "%CHOICE%"=="4" goto RESET
if "%CHOICE%"=="5" exit /b 0
goto MENU

:CHECK_NODE
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Node.js not found!
    echo         Download from: https://nodejs.org  (LTS version)
    echo.
    pause
    goto MENU
)
goto :EOF

:INSTALL
call :CHECK_NODE
echo.
echo [SETUP] Installing/updating dependencies...
npm install
echo.
echo [OK] Done!
pause
goto MENU

:RESET
echo.
echo [RESET] Deleting saved WhatsApp session...
if exist "auth_info" rmdir /s /q "auth_info"
mkdir auth_info
echo [OK] Session cleared. You will need to scan QR again.
pause
goto MENU

:MCP_SERVER
call :CHECK_NODE
if not exist "node_modules" (
    echo [SETUP] First run - installing dependencies...
    npm install
)
echo.
echo  =====================================================
echo   MCP SERVER MODE
echo  =====================================================
echo.
echo  Add to Claude Desktop config (claude_desktop_config.json):
echo.
echo  {
echo    "mcpServers": {
echo      "whatsapp": {
echo        "command": "node",
echo        "args": ["%~dp0src\index.js"]
echo      }
echo    }
echo  }
echo.
echo  Config file location:
echo  Windows: %%APPDATA%%\Claude\claude_desktop_config.json
echo.
echo  Starting MCP server on stdio...
echo  (QR code will appear - scan with WhatsApp)
echo  (Use Ctrl+C to stop)
echo.
node src/index.js
pause
goto MENU

:AI_BOT
call :CHECK_NODE
if not exist "node_modules" (
    echo [SETUP] First run - installing dependencies...
    npm install
)
if not exist ".env" (
    echo.
    echo [SETUP] No .env file found!
    echo.
    set /p APIKEY=" Enter your Anthropic API key (sk-ant-...): "
    echo ANTHROPIC_API_KEY=!APIKEY!> .env
    echo [OK] Saved to .env
    echo.
)
echo.
echo  =====================================================
echo   AI BOT MODE - Auto-replies using Claude AI
echo  =====================================================
echo.
echo  Scan QR code with WhatsApp to connect.
echo  The bot will automatically reply to all messages.
echo  (Use Ctrl+C to stop)
echo.
setlocal enabledelayedexpansion
node src/bot.js
pause
goto MENU
