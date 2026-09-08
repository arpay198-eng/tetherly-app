@echo off
start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0run-localhost.ps1"
echo Tetherly localhost watchdog started. Server: http://localhost:3000
echo Logs: server.log and server-watchdog.log