@echo off
setlocal
rem Lanzador de Singevery: compila (si hace falta) y abre la app en modo produccion.
rem Uso: launch.cmd [--skip-build]

title Singevery - preparando...
cd /d "%~dp0.."

if not exist node_modules (
  echo [launch] Instalando dependencias ^(primera vez^)...
  call npm install
  if errorlevel 1 goto :error
)

if /i "%~1"=="--skip-build" goto :run

echo [launch] Compilando Singevery...
call npm run build
if errorlevel 1 goto :error

:run
title Singevery
echo [launch] Abriendo Singevery...
call npx electron .
exit /b %errorlevel%

:error
echo.
echo [launch] La compilacion fallo. Revisa los errores de arriba.
pause
exit /b 1
