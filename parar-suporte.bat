@echo off
REM ============================================================
REM  StartPainel Suporte — Para todos os workers (mantem tunel)
REM ============================================================
REM  Usa PowerShell em vez de wmic (deprecated no Win11).
REM  Mata apenas processos node.exe cuja linha de comando contem
REM  'worker.ts' — nao toca em node.exe do VSCode/Cursor.
REM ============================================================

title Parando StartPainel Worker
color 0E

echo.
echo  Procurando workers ativos...
echo.

powershell -NoProfile -Command ^
  "$killed = 0; $procs = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*worker.ts*' }; if (-not $procs) { Write-Host '   Nenhum worker rodando.' -ForegroundColor Yellow } else { foreach ($p in $procs) { Write-Host ('   Matando PID ' + $p.ProcessId + ' (' + $p.CommandLine.Substring(0, [Math]::Min(70, $p.CommandLine.Length)) + '...)') -ForegroundColor Cyan; Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue; $killed++ }; Write-Host ('   Total parados: ' + $killed) -ForegroundColor Green }"

echo.
echo  ^(Tunel Cloudflare continua ativo — e um servico do Windows^)
echo.
timeout /t 4 >nul
