@echo off
cls
echo =======================================================================
echo          ATIVADOR DE SESSAO DO ATIVEAPP (CHROME ORIGINAL)
echo =======================================================================
echo.
echo Vamos abrir o seu Google Chrome ORIGINAL carregando o perfil da
echo automacao (Perfil-98). Voce faz o login UMA vez, passa a verificacao
echo por telefone, e a sessao fica salva pra automacao usar depois.
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
echo.

start chrome --user-data-dir="C:\Users\notec\AppData\Local\Google\Chrome\User Data\PuppeteerProfile-98" "https://www.ativeapp.com/auth"

echo =======================================================================
echo SESSAO INICIADA!
echo.
echo 1. Faca o login com: lucassuporte24h@gmail.com
echo 2. Conclua a verificacao por telefone (se pedir).
echo 3. Quando chegar no Dashboard do AtiveApp, FECHE o navegador.
echo 4. Volte aqui e pressione qualquer tecla.
echo.
echo A partir de agora a automacao usa essa sessao sem pedir verificacao.
echo =======================================================================
pause
