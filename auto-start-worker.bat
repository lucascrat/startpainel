@echo off
title StartPainel Worker 2026 (Auto)
color 0A

REM Adiciona Node.js ao PATH desta sessao
set "PATH=C:\Users\notec\nodejs;%PATH%"

cd /d D:\startpainel\startpainel

echo.
echo  ============================================
echo   STARTPAINEL - WORKER AUTO-RESTART
echo  ============================================
echo.
echo  Node:
node --version
echo  Modo automatico: reinicia sozinho se cair.
echo  Para parar definitivamente, feche esta janela.
echo.

:loop
echo [%date% %time%] Iniciando worker...
echo.
call npm run worker
echo.
echo [%date% %time%] Worker encerrou. Reiniciando em 10s...
echo  (Pressione Ctrl+C agora para cancelar o auto-restart)
timeout /t 10 /nobreak >nul
goto loop
