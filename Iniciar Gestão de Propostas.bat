@echo off
chcp 65001 >nul
title Gestão de Propostas
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js nao encontrado nesta maquina.
  echo Instale em https://nodejs.org e rode este arquivo de novo.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\express" (
  echo Primeira execucao: instalando dependencias, aguarde...
  call npm install
  if errorlevel 1 (
    echo.
    echo Falha ao instalar as dependencias. Verifique a internet e tente de novo.
    echo.
    pause
    exit /b 1
  )
)

echo Iniciando o sistema Gestão de Propostas...
echo Aguarde, o navegador abre sozinho quando o servidor estiver pronto.

rem So abre o navegador depois que o servidor responder (evita pagina de erro)
start "" /min powershell -NoProfile -ExecutionPolicy Bypass -Command "for($i=0;$i -lt 60;$i++){try{$null=Invoke-WebRequest -UseBasicParsing 'http://localhost:3060/' -TimeoutSec 2; Start-Process 'http://localhost:3060'; exit}catch{Start-Sleep -Milliseconds 500}}"

node server.js
echo.
echo O servidor foi encerrado.
pause
