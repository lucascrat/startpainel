@echo off
title Import Clientes StartPainel 2026
color 0B

set "PATH=C:\Users\notec\nodejs;%PATH%"

echo.
echo  ============================================
echo   IMPORTAR CLIENTES DO PAINEL StartPainel
echo  ============================================
echo.
echo  Vai abrir o Chrome (perfil separado do worker)
echo  e percorrer todos os clientes da lista,
echo  cadastrando no banco.
echo.
echo  Tempo estimado: ~15-25 minutos
echo.
echo  IMPORTANTE: nao feche esta janela enquanto roda.
echo.
pause

cd /d D:\startpainel\startpainel
call npm run import-panel

echo.
echo  Import finalizado. Veja o resumo acima.
pause
