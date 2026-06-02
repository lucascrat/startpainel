@echo off
cls
echo =======================================================================
echo          ATIVADOR DE SESSAO DO SMARTONE (CHROME ORIGINAL)
echo =======================================================================
echo.
echo Para evitar erros do Cloudflare Turnstile, vamos abrir o seu Google
echo Chrome ORIGINAL carregando o perfil da automacao.
echo.
echo IMPORTANTE: Precisamos fechar todas as janelas abertas do Chrome agora
echo para evitar conflito de acesso ao perfil.
echo.
set /p confirm="Podemos fechar o seu Chrome agora e iniciar? (S/N): "
if /i "%confirm%" neq "S" (
    echo Operacao cancelada.
    pause
    exit /b
)

echo.
echo Fechando Google Chrome...
taskkill /f /im chrome.exe 2>nul
ping -n 3 127.0.0.1 >nul

echo.
echo Abrindo o Chrome ORIGINAL com o perfil da automacao...
echo FACA O LOGIN NO SITE E DEPOIS FECHE O NAVEGADOR.
echo.

start chrome --user-data-dir="C:\Users\notec\AppData\Local\Google\Chrome\User Data\PuppeteerProfile-99" "https://smartone-iptv.com/client/login"

echo =======================================================================
echo SESSAO INICIADA!
echo.
echo 1. Faca o login normalmente no site com suas credenciais.
echo 2. Resolva o captcha da Cloudflare.
echo 3. Assim que entrar na tela de adicionar playlist, FECHE o navegador.
echo 4. Volte aqui e pressione qualquer tecla.
echo =======================================================================
pause
