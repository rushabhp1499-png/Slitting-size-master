@echo off
title SlitSmart Factory OS
echo Starting SlitSmart Factory OS...
set "NODE_CMD=C:\Users\rusha\AppData\Roaming\Antigravity\bin\agy-node.cmd"

if exist "%NODE_CMD%" (
    start "" "%NODE_CMD%" "%~dp0server.js"
    timeout /t 2 >nul
    start http://localhost:3030
) else (
    start "" "%~dp0index.html"
)
echo App launched in your default web browser!
exit
