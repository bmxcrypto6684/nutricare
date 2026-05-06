@echo off
title NutriCare - Sistema Completo
cd /d "C:\Users\johnn\projeto nutriçao"

echo ========================================
echo    🌿 NutriCare - Sistema de Consulta
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

npm run dev
pause
