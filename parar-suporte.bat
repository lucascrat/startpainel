@echo off
REM ============================================================
REM  StartPainel Suporte — Para o worker (mantem tunel rodando)
REM ============================================================
REM  Por que NAO para o tunel:
REM   O cloudflared e instalado como servico do Windows e fica de pe
REM   24/7 — voce so quer parar o worker (que abre Chrome visivel).
REM
REM  Se quiser parar o tunel tambem, rode como admin:
REM   net stop cloudflared
REM ============================================================

title Parando StartPainel Worker
color 0E

echo.
echo  Parando worker do StartPainel...
echo.

set FOUND=0
for /f "tokens=2 delims=," %%P in ('wmic process where "name='node.exe' and commandline like '%%worker.ts%%'" get processid /format:csv 2^>nul ^| findstr /r "[0-9]"') do (
  echo   Matando PID %%P
  taskkill /F /PID %%P >nul 2>&1
  set FOUND=1
)

if %FOUND% EQU 0 (
  echo  Nenhum worker rodando.
) else (
  echo  Worker parado.
)

echo.
echo  ^(Tunel Cloudflare continua ativo — e um servico do Windows^)
echo.
timeout /t 3 >nul
