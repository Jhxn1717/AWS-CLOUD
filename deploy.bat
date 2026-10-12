@echo off
REM Script de despliegue para MyCloud PaaS en Windows
REM Uso: deploy.bat

echo === MyCloud PaaS - Despliegue Script Windows ===
echo.

set BACKEND_DIR=%~dp0backend
set PORT=3001

:check_dependencies
echo [1/4] Verificando dependencias...
where node >nul 2>nul || (echo [ERROR] Node.js no está instalado && exit /b 1)
where npm >nul 2>nul || (echo [ERROR] npm no está instalado && exit /b 1)
where psql >nul 2>nul || (echo [ERROR] PostgreSQL no está instalado && exit /b 1)
echo [OK] Todas las dependencias están instaladas

:setup_database
echo.
echo [2/4] Configurando base de datos...
cd /d "%BACKEND_DIR%"
call npx ts-node src/scripts/initDb.ts || (echo [ERROR] Error al inicializar base de datos && exit /b 1)
echo [OK] Base de datos inicializada

call npx ts-node src/scripts/seedDb.ts || (echo [ERROR] Error al crear usuario admin && exit /b 1)
echo [OK] Usuario admin creado

:build_backend
echo.
echo [3/4] Compilando backend...
call npm run build || (echo [ERROR] Error al compilar && exit /b 1)
echo [OK] Backend compilado

:start_backend
echo.
echo [4/4] Iniciando backend...
start "MyCloud Backend" cmd /k "cd /d "%BACKEND_DIR%" && npm start"
echo [OK] Backend iniciado en una nueva ventana

:show_info
echo.
echo === Información de Acceso ===
echo.
echo [🌐] URL del Frontend: http://localhost:5173
echo [🔌] URL del Backend: http://localhost:%PORT%
echo.
echo [🔐] Acceso: usa ADMIN_EMAIL y ADMIN_PASSWORD configurados en backend\.env
echo.
echo [📝] Ver logs: %BACKEND_DIR%\logs\app.log
echo.
pause
