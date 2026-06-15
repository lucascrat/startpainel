@echo off
color 0C
echo.
echo  Encerrando StartPainel Worker...
taskkill /FI "WINDOWTITLE eq StartPainel Worker 2026" /F >nul 2>&1
taskkill /FI "IMAGENAME eq node.exe" /FI "WINDOWTITLE eq StartPainel*" /F >nul 2>&1
echo  Worker encerrado.
echo.
pause
