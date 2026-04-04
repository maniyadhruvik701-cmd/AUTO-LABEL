@echo off
title Auto Label Printer Starter
cd /d "%~dp0"

echo [1/4] Checking Dependencies...
if not exist "node_modules\pdf-lib" (
    echo Missing 'pdf-lib'. Running npm install...
    call npm install
)

echo [2/4] Starting Node.js Server...
taskkill /f /im node.exe >nul 2>&1
start cmd /k "node server.js"

echo [3/4] Configuring Ngrok Authtoken...
call npx ngrok config add-authtoken 3AcZCHWlcFOKzDOJUX9CYnJwvn8_ud595hgsF6wGeHGxhepK

echo [4/4] Starting Ngrok Tunnel...
taskkill /f /im ngrok.exe >nul 2>&1
start cmd /k "npx ngrok http --domain=unalleviated-logogrammatically-yolanda.ngrok-free.dev 3001"

echo.
echo Everything is starting up! You can minimize these windows.
pause