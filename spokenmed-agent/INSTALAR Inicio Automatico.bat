@echo off
REM ── Cria atalho na pasta de inicialização do Windows
REM    Resultado: o agente roda automaticamente toda vez que você loga no PC.
setlocal
set "ALVO=%~dp0Iniciar Silenciosamente.vbs"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "ATALHO=%STARTUP%\SpokenMED Agente.lnk"

echo.
echo  Criando atalho de inicializacao automatica...
echo  Alvo:   %ALVO%
echo  Atalho: %ATALHO%
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$s=(New-Object -ComObject WScript.Shell).CreateShortcut('%ATALHO%');" ^
  "$s.TargetPath='%ALVO%'; $s.WorkingDirectory='%~dp0'; $s.WindowStyle=7;" ^
  "$s.Description='SpokenMED Agente — mantem sessao do Fiorilli quente';" ^
  "$s.Save()"

if exist "%ATALHO%" (
  echo  ✓ Atalho criado com sucesso.
  echo    O agente rodara silenciosamente toda vez que voce logar no Windows.
) else (
  echo  ✗ Falhou ao criar o atalho. Tente rodar este .bat como Administrador.
)
echo.
pause
endlocal
