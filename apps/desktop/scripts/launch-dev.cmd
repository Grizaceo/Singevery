@echo off
setlocal
rem Lanzador de Singevery en modo desarrollo (Vite + Electron con hot-reload).

title Singevery (dev)
cd /d "%~dp0.."

if not exist node_modules (
  echo [launch-dev] Instalando dependencias ^(primera vez^)...
  call npm install
  if errorlevel 1 (
    echo [launch-dev] npm install fallo.
    pause
    exit /b 1
  )
)

echo [launch-dev] Iniciando Singevery en modo desarrollo...
call npm run dev:electron
if errorlevel 1 (
  echo.
  echo [launch-dev] Termino con error. Prueba: npm run dev:kill
  pause
)
exit /b %errorlevel%
