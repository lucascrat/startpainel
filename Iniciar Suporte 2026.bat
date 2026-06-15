@echo off
title StartPainel Worker 2026
color 0A

set "PATH=C:\Users\notec\nodejs;%PATH%"

echo.
echo  ============================================
echo   STARTPAINEL - WORKER DE SUPORTE 2026
echo  ============================================
echo.
echo  Iniciando worker com 5 perfis paralelos...
echo  Nao feche esta janela enquanto estiver atendendo.
echo.
cd /d D:\startpainel\startpainel
call npm run worker
echo.
echo  Worker encerrado.
pause
