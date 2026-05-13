' ============================================================
'  StartPainel Suporte - Versao SILENCIOSA (background)
' ============================================================
'  Roda o iniciar-suporte.bat sem abrir nenhuma janela visivel.
'  Ideal pra colocar no startup do Windows e esquecer que existe.
'
'  Como adicionar ao startup do Windows:
'    1. Win+R -> digite: shell:startup
'    2. Cole um atalho deste arquivo na pasta que abriu.
'
'  Pra parar: rode parar-suporte.bat (esse mata o worker silencioso tambem).
' ============================================================

Set objShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Pega o diretorio onde este .vbs esta (independe de onde for chamado)
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

' Roda o .bat com janela escondida (0 = hidden) e sem esperar (false)
objShell.Run """" & scriptDir & "\iniciar-suporte.bat""", 0, False
