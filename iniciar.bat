@echo off
title NutriCare - Sistema Completo
cd /d "C:\Users\johnn\projeto nutriçao"

echo ========================================
echo    NutriCare - Sistema de Consulta
echo    Nutricional
echo ========================================
echo.
echo Iniciando servidores...
echo.
echo   Frontend: http://localhost:3000
echo   API:      http://localhost:3001
echo   Health:   http://localhost:3001/api/health
echo.
echo Pressione CTRL+C para parar ambos
echo ========================================
echo.

start "NutriCare WEB" /B cmd /c npx serve -s . -l 3000 --cors
start "NutriCare API" /B cmd /c node server/server.js

echo Servidores iniciados!
echo Abra http://localhost:3000 no navegador
echo.
pause
