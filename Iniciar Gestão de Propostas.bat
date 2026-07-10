@echo off
chcp 65001 >nul
title Gestão de Propostas
cd /d "%~dp0"
echo Iniciando o sistema Gestão de Propostas...
start "" http://localhost:3050
node server.js
pause
