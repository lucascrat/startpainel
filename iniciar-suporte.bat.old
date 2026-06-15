@echo off
REM ============================================================
REM  StartPainel Suporte — Inicia tunel Cloudflare + Worker local
REM ============================================================
REM  O que faz quando voce clica duas vezes:
REM   1. Confere se o servico cloudflared esta rodando, inicia se nao
REM   2. Mata workers antigos do node pra evitar conflito de PID
REM   3. Inicia 'npm run worker' nesta janela, mostrando os logs
REM
REM  Pra fechar: fecha a janela (X) OU Ctrl+C.
REM ============================================================

title StartPainel Suporte (Worker + Tunel)
color 0A

cd /d "%~dp0"

echo.
echo  ============================================================
echo    StartPainel Suporte
echo    Iniciando tunel Cloudflare + Worker do PC
echo  ============================================================
echo.

REM --- 1. Cloudflare Tunnel (servico Windows) ---
echo  [1/3] Verificando tunel Cloudflare...
sc query cloudflared >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo        AVISO: servico 'cloudflared' nao encontrado.
  echo        Instale com: cloudflared.exe service install ^<TOKEN^>
  echo        Continuando sem tunel — automacoes locais ainda funcionam.
  goto :worker
)

for /f "tokens=3" %%S in ('sc query cloudflared ^| findstr STATE') do (
  if /i "%%S"=="RUNNING" (
    echo        OK — tunel ja esta rodando.
    goto :worker
  )
)

echo        Iniciando servico cloudflared...
net start cloudflared >nul 2>&1
if %ERRORLEVEL% EQU 0 (
  echo        OK — tunel iniciado.
) else (
  echo        AVISO: nao consegui iniciar tunel ^(rode como administrador?^)
  echo        Continuando assim mesmo...
)

:worker

REM --- 2. Limpa workers antigos (PowerShell, evita wmic deprecated) ---
echo.
echo  [2/3] Limpando workers antigos do node...
powershell -NoProfile -Command ^
  "$procs = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*worker.ts*' }; foreach ($p in $procs) { Write-Host ('       matando PID ' + $p.ProcessId); Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }"
echo        OK.

REM --- 3. Verifica que o projeto esta em ordem ---
echo.
echo  [3/3] Verificando projeto...
if not exist "package.json" (
  echo        ERRO: package.json nao encontrado em %CD%
  echo        Esse .bat tem que estar na raiz do projeto startpainel.
  pause
  exit /b 1
)
if not exist "node_modules" (
  echo        AVISO: node_modules ausente — rodando 'npm install' agora ^(demora ^~2min^)...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo        ERRO no npm install. Veja a saida acima.
    pause
    exit /b 1
  )
)
echo        OK.

REM --- Inicia o worker ---
echo.
echo  ============================================================
echo    Iniciando worker... os logs aparecem abaixo.
echo    Para PARAR: feche esta janela ou Ctrl+C
echo  ============================================================
echo.

call npm run worker

REM Se o worker cair, segura a janela aberta pra voce ver o motivo.
echo.
echo  Worker encerrado. Pressione qualquer tecla pra fechar.
pause >nul
