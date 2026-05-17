@echo off
REM ── Remove o atalho de inicialização automática
set "ATALHO=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\SpokenMED Agente.lnk"
if exist "%ATALHO%" (
  del "%ATALHO%"
  echo  ✓ Inicio automatico DESATIVADO.
) else (
  echo  Nao havia atalho de inicio automatico.
)
echo.
pause
