@echo off
set CHROME_PATH=

if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    set "CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe"
) else if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    set "CHROME_PATH=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
) else if exist "%USERPROFILE%\AppData\Local\Google\Chrome\Application\chrome.exe" (
    set "CHROME_PATH=%USERPROFILE%\AppData\Local\Google\Chrome\Application\chrome.exe"
)

if "%CHROME_PATH%" == "" (
    echo [ERRO] Nao foi possivel encontrar o Google Chrome automaticamente.
    echo Por favor, instale o Google Chrome ou inicie-o manualmente com o parametro: --remote-debugging-port=9222
    pause
    exit /b
)

echo [OK] Google Chrome encontrado em: "%CHROME_PATH%"
echo [INFO] Iniciando Google Chrome em modo de Depuracao Remota (porta 9222)...
echo [INFO] Usando perfil de dados dedicado em: "%LOCALAPPDATA%\Google\Chrome\User Data\RemoteDebugProfile"
echo [INFO] IMPORTANTE: Faca login no painel nesta janela aberta para salvar seu login e burlar o captcha.
echo [INFO] Nao feche essa janela do prompt de comando enquanto estiver usando o worker.
echo.

start "" "%CHROME_PATH%" --remote-debugging-port=9222 --user-data-dir="%LOCALAPPDATA%\Google\Chrome\User Data\RemoteDebugProfile" --no-first-run --no-default-browser-check

echo Chrome iniciado com sucesso!
pause
