@echo off
cd /d "%~dp0"
title Quintal - Web Mode (Multi-Tab Testing)
echo Iniciando Quintal no Navegador...
start http://localhost:5173
npm run dev:web
pause
