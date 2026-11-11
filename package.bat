@echo off
cd /d "%~dp0"
title Quintal - Gerar Instalador Windows
echo ===================================================
echo             QUINTAL - GERANDO INSTALADOR .EXE
echo ===================================================
echo.
echo Diretorio atual: %cd%
echo.
echo Gerando instalador do Windows...
call npm run package:win
echo.
echo ===================================================
echo Instalador gerado com sucesso em:
echo desktop/dist-electron/
echo ===================================================
pause
