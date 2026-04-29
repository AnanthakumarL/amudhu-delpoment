@echo off
title Add WhatsApp MCP to Claude Desktop
color 0B

cd /d "%~dp0"
set "MCP_PATH=%~dp0src\index.js"
set "CONFIG_DIR=%APPDATA%\Claude"
set "CONFIG_FILE=%CONFIG_DIR%\claude_desktop_config.json"

echo.
echo  =====================================================
echo   Adding WhatsApp MCP to Claude Desktop
echo  =====================================================
echo.

:: Create Claude config dir if not exists
if not exist "%CONFIG_DIR%" mkdir "%CONFIG_DIR%"

:: Check if config exists
if not exist "%CONFIG_FILE%" (
    echo  Creating new config file...
    echo {> "%CONFIG_FILE%"
    echo   "mcpServers": {>> "%CONFIG_FILE%"
    echo     "whatsapp": {>> "%CONFIG_FILE%"
    echo       "command": "node",>> "%CONFIG_FILE%"
    echo       "args": ["%MCP_PATH:\=\\%"]>> "%CONFIG_FILE%"
    echo     }>> "%CONFIG_FILE%"
    echo   }>> "%CONFIG_FILE%"
    echo }>> "%CONFIG_FILE%"
    echo.
    echo  [OK] Config created at: %CONFIG_FILE%
) else (
    echo  [INFO] Existing config found at: %CONFIG_FILE%
    echo.
    echo  Please manually add this to your claude_desktop_config.json
    echo  under "mcpServers":
    echo.
    echo    "whatsapp": {
    echo      "command": "node",
    echo      "args": ["%MCP_PATH:\=\\%"]
    echo    }
    echo.
    echo  Opening config file...
    notepad "%CONFIG_FILE%"
)

echo.
echo  =====================================================
echo   NEXT STEPS:
echo   1. Restart Claude Desktop
echo   2. Run RUN.bat and choose Mode 1 (MCP Server)
echo   3. Scan QR code in WhatsApp
echo   4. Use Claude with WhatsApp tools!
echo  =====================================================
echo.
pause
