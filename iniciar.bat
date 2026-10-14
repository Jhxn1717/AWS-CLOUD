@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar.ps1" %*
if errorlevel 1 (
    echo.
    echo No se pudo completar el inicio. Revisa el error de arriba.
    pause
    exit /b 1
)
