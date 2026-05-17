@echo off
REM ── SpokenMED Agente (modo visível — pra testar e ver logs em tempo real)
cd /d "%~dp0"
title SpokenMED Agente
echo.
echo  ============================================================
echo   SpokenMED Agente — mantendo sessao do Fiorilli quente
echo  ============================================================
echo.
echo   Logs sao gravados em: %~dp0agent.log
echo   Para parar: feche esta janela ou CTRL+C
echo.
"%~dp0runtime\python.exe" "%~dp0runtime\agent.py"
echo.
echo  ============================================================
echo   Agente finalizou. Pressione qualquer tecla para fechar.
echo  ============================================================
pause >nul
