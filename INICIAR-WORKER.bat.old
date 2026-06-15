@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1
title StartPainel Worker - Inicializando...
color 0A
cd /d "%~dp0"

echo.
echo ================================================================
echo   STARTPAINEL - INICIALIZADOR COMPLETO DO WORKER 2026
echo ================================================================
echo.
echo  O que este script faz:
echo    1. Verifica Node.js
echo    2. Verifica dependencias (npm install se necessario)
echo    3. Inicia tunel Cloudflare
echo    4. Login AtiveApp (perfil-98) se sessao inexistente
echo    5. Mata workers antigos do Node
echo    6. Inicia o worker com auto-restart
echo.
echo ================================================================
echo.

REM ── PATH do Node ────────────────────────────────────────────────
set "PATH=C:\Users\notec\nodejs;C:\Users\notec\AppData\Roaming\npm;%PATH%"

REM ── 1. Verifica Node.js ─────────────────────────────────────────
echo [1/5] Verificando Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo  ERRO: Node.js nao encontrado em C:\Users\notec\nodejs
    echo  Instale em: https://nodejs.org
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%V in ('node --version') do set NODE_VER=%%V
echo        OK - Node %NODE_VER%

REM ── 2. Dependencias ─────────────────────────────────────────────
echo.
echo [2/5] Verificando dependencias (node_modules)...
if not exist "node_modules" (
    echo        Instalando dependencias pela primeira vez...
    echo        Isso pode levar 2-3 minutos.
    echo.
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo.
        echo  ERRO no npm install. Verifique a saida acima.
        pause
        exit /b 1
    )
    echo        OK - dependencias instaladas.
) else (
    echo        OK - node_modules presente.
)

REM ── 3. Tunel Cloudflare ─────────────────────────────────────────
echo.
echo [3/5] Verificando tunel Cloudflare...
sc query cloudflared >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo        AVISO: servico cloudflared nao encontrado.
    echo        Worker continua sem tunel - automacoes locais funcionam.
    goto :check_ativeapp
)

set TUNNEL_RUNNING=0
for /f "tokens=3" %%S in ('sc query cloudflared ^| findstr STATE') do (
    if /i "%%S"=="RUNNING" set TUNNEL_RUNNING=1
)
if "!TUNNEL_RUNNING!"=="1" (
    echo        OK - tunel ja esta rodando.
) else (
    echo        Iniciando cloudflared...
    net start cloudflared >nul 2>&1
    if errorlevel 1 (
        echo        AVISO: nao conseguiu iniciar o tunel.
        echo        Tente como Administrador se precisar do tunel.
    ) else (
        echo        OK - tunel iniciado.
    )
)

REM ── 4. Sessao AtiveApp ──────────────────────────────────────────
:check_ativeapp
echo.
echo [4/5] Verificando sessao AtiveApp (perfil-98)...
set "ATIVEAPP_PROFILE=C:\Users\notec\AppData\Local\Google\Chrome\User Data\PuppeteerProfile-98"
if exist "!ATIVEAPP_PROFILE!\Default\Cookies" (
    echo        OK - sessao AtiveApp existe.
) else (
    echo        Sessao AtiveApp nao encontrada - fazendo login automatico...
    echo.
    echo  -------------------------------------------------------
    echo   O Chrome vai abrir para login no AtiveApp.
    echo   O login sera feito automaticamente.
    echo   Se pedir verificacao por telefone, conclua manualmente
    echo   e aguarde o Chrome fechar sozinho.
    echo  -------------------------------------------------------
    echo.
    call npx tsx scripts/login-ativeapp.ts
    echo.
    echo        Login AtiveApp concluido.
)

echo.
echo [4/5] Verificando sessao SmartOne (perfil-99)...
set "SMARTONE_PROFILE=C:\Users\notec\AppData\Local\Google\Chrome\User Data\PuppeteerProfile-99"
if exist "!SMARTONE_PROFILE!\Default\Cookies" (
    echo        OK - sessao SmartOne existe.
) else (
    echo        AVISO: sessao SmartOne nao encontrada.
    echo        Execute 'iniciar-autenticacao-smartone.bat' separadamente.
)

REM ── 5. Mata workers antigos ────────────────────────────────────
echo.
echo [5/5] Limpando workers antigos do Node...
powershell -NoProfile -Command "$procs = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*worker.ts*' }; if ($procs) { $procs | ForEach-Object { Write-Host ('       Matando PID ' + $_.ProcessId); Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } } else { Write-Host '       Nenhum worker antigo encontrado.' }"
echo        OK.

REM ── Inicia o Worker com auto-restart ───────────────────────────
echo.
echo ================================================================
echo   TUDO PRONTO - WORKER INICIANDO AGORA
echo.
echo   * Auto-restart ativo: reinicia sozinho se cair
echo   * Para parar definitivamente: feche esta janela (X)
echo   * Logs aparecem abaixo em tempo real
echo ================================================================
echo.

title StartPainel Worker - RODANDO

:loop
echo ----------------------------------------------------------------
echo  [%date% %time%] Worker iniciado
echo ----------------------------------------------------------------
echo.
call npm run worker
echo.
echo ----------------------------------------------------------------
echo  [%date% %time%] Worker encerrou.
echo  Reiniciando em 10 segundos... (Ctrl+C para cancelar)
echo ----------------------------------------------------------------
timeout /t 10 /nobreak >nul
echo.
goto :loop
