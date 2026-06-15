@echo off
color 0E

set "PATH=C:\Users\notec\nodejs;%PATH%"

echo.
echo  Encerrando worker atual...
taskkill /FI "WINDOWTITLE eq StartPainel Worker 2026*" /F >nul 2>&1
timeout /t 2 /nobreak >nul

echo  Iniciando novo worker...
start "StartPainel Worker 2026" cmd /k "set PATH=C:\Users\notec\nodejs;%%PATH%% && color 0A && echo. && echo  ============================================ && echo   STARTPAINEL - WORKER DE SUPORTE 2026 && echo  ============================================ && echo. && cd /d D:\startpainel\startpainel && call npm run worker"
echo  Worker reiniciado com sucesso!
timeout /t 2 /nobreak >nul
