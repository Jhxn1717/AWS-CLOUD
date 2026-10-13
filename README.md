# AWS-CLOUD

## MyCloud — Private Native PaaS Platform (Zero Docker)

MyCloud es una plataforma PaaS (Platform as a Service) privada de grado de producción inspirada conceptualmente en AWS/Railway/Vercel, diseñada y desarrollada 100% desde cero en **Node.js, Express, TypeScript, PostgreSQL y React/Vite**, sin dependencias de Docker ni virtualización de contenedores.

---

## 1. Características Principales

- **Sin Docker (100% Native OS Processes)**: Todas las aplicaciones se ejecutan como procesos nativos del sistema operativo mediante `child_process.spawn()`.
- **Compatibilidad Runtimes**: Node.js, Python, Java (Maven/Gradle), PHP.
- **Detección Automática Inteligente**: El analizador detecta lenguaje, framework (React, Vite, Next.js, Express, FastAPI, Flask, Django, Spring Boot, Laravel) y tipo de aplicación (`BACKEND`, `STATIC_FRONTEND`, `FULLSTACK`).
- **Regla Crítica React/Vite**: Las aplicaciones React/Vite nunca intentan ejecutar `node index.js`. Pasan por `npm install` $\to$ `npm run build` $\to$ verificación de `dist/index.html` $\to$ levantamiento de un servidor HTTP estático nativo propio con soporte para SPA Routing (`index.html` fallback) en el puerto asignado.
- **Port Manager**: Pool dinámico de puertos `4000-5000` con bloqueo atómico en PostgreSQL y comprobación física de sockets en el sistema operativo.
- **Process Manager**: Supervisión continua de PID, buffering de logs en tiempo real, salida por stdout/stderr, detección de fallos y detención limpia del árbol completo de procesos (`taskkill /T /F` en Windows).
- **Pipeline de Deployment en 10 Etapas**:
  1. `ZIP_UPLOAD` (Carga segura y validada)
  2. `EXTRACTION` (Protección estricta contra Zip Slip y Zip Bombs)
  3. `ANALYSIS` (Inspección de dependencias y comandos)
  4. `DEPENDENCY_INSTALL` (Instalación real: `npm install`, `pip install`, etc.)
  5. `DATABASE_PROVISIONING` (Aislamiento de credenciales y BD)
  6. `BUILD` (Compilación real de artefactos)
  7. `PORT_ALLOCATION` (Asignación de puerto en pool 4000-5000)
  8. `PROCESS_START` (Arranque de proceso nativo con variables inyectadas)
  9. `HEALTH_CHECK` (Sondeo HTTP 200-399 con verificación de vida del proceso)
  10. `RUNNING` (Aplicación en producción lista)
- **Regla Contra Falsos Éxitos**: Si el proceso termina con código distinto de 0 o el health check falla, el despliegue se marca **inmediatamente** como `FAILED` con el error real y la salida de la consola.
- **Consola Web Profesional**: Panel de control estilo AWS/Vercel (Dark Mode) con Dashboard de métricas, catálogo de proyectos, visualizador visual del pipeline en tiempo real, visor de logs streaming por Server-Sent Events (SSE) y gestor de variables de entorno.
- **Persistencia PostgreSQL**: Se conecta a PostgreSQL local en desarrollo o a un proveedor administrado (Neon/Supabase) mediante `DATABASE_URL` y TLS en producción.

---

## 2. Requisitos Previos

- **Sistema Operativo**: Windows 10/11 o Linux / macOS.
- **Node.js**: v20.0.0 o superior (v22 recomendada y requerida por Vercel CLI).
- **npm**: v9.0.0 o superior.
- **PostgreSQL**: PostgreSQL 14+ local para desarrollo o una base administrada compatible con `pg` (Neon/Supabase) para producción.
- **Python**: 3.10+ (opcional, para despliegue de aplicaciones Python).

---

## 3. Estructura del Repositorio

```
mycloud/
├── backend/
│   ├── src/
│   │   ├── config/              # Base de datos y variables de entorno
│   │   ├── controllers/         # Controladores Auth, Proyectos, Deployments, Sistema
│   │   ├── middleware/          # JWT Auth, Multer ZIP Filter, Error Handler
│   │   ├── models/              # Tipos TypeScript y esquema schema.sql
│   │   ├── routes/              # Rutas Express (/api/auth, /api/projects, ...)
│   │   ├── services/
│   │   │   ├── ProjectService.ts
│   │   │   ├── ProjectAnalyzer.ts
│   │   │   ├── DeploymentService.ts
│   │   │   ├── ProcessManager.ts
│   │   │   ├── PortManager.ts
│   │   │   ├── DatabaseManager.ts
│   │   │   ├── StorageManager.ts
│   │   │   ├── HealthCheckService.ts
│   │   │   └── LogService.ts
│   │   ├── utils/               # Zip Slip Security, Process Helpers
│   │   ├── scripts/             # initDb.ts, staticRunner.ts
│   │   └── index.ts             # Servidor API Express
│   ├── projects/                # Directorios aislados de proyectos desplegados
│   ├── uploads/                 # Subidas temporales seguras de archivos ZIP
│   ├── logs/                    # Archivos de log en disco por proyecto y deployment
│   ├── data/                    # Base de datos persistente
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── api/                 # Cliente API con interceptores JWT y SSE streaming
│   │   ├── components/          # Navbar, MetricCard, PipelineViewer, LogViewer, Modal
│   │   ├── pages/               # Login, Dashboard, Projects, ProjectDetail
│   │   ├── App.tsx              # Ruteo reactivo y estado global
│   │   ├── index.css            # Tailwind directives y scrollbars oscuros
│   │   └── main.tsx
│   ├── package.json
│   ├── vite.config.ts
│   └── index.html
├── test-projects/
│   ├── vite-react-demo/         # Proyecto real de prueba React + Vite
│   ├── express-demo/            # Proyecto real de prueba Node.js Express REST API
│   ├── python-demo/             # Microservicio real de prueba en Python 3.11
│   └── failing-demo/            # Prueba de control de fallas (Regla contra falsos éxitos)
├── README.md
└── .gitignore
```

---

## 4. Instalación y Configuración

### Paso 1: Configurar el Backend

1. Entra al directorio del backend:
   ```powershell
   cd backend
   ```
2. Instala las dependencias:
   ```powershell
   npm install
   ```
3. Configura el archivo `.env`:
   ```powershell
   cp .env.example .env
   ```
   Asegúrate de que los valores coincidan con tu entorno local:
   ```env
   PORT=3001
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=mycloud_platform
   DB_USER=postgres
   DB_PASSWORD=REEMPLAZAR_POR_UNA_CLAVE_SEGURA
   JWT_SECRET=REEMPLAZAR_POR_UN_SECRETO_ALEATORIO_LARGO
   ADMIN_NAME=MyCloud Admin
   ADMIN_EMAIL=admin@example.com
   ADMIN_PASSWORD=REEMPLAZAR_POR_UNA_CLAVE_DE_12_CARACTERES_O_MAS
   PROJECTS_BASE_PATH=./projects
   UPLOADS_PATH=./uploads
   PORT_RANGE_START=4000
   PORT_RANGE_END=5000
   ```

4. Inicializa la base de datos y siembra el pool de puertos (4000-5000) y usuario inicial:
   ```powershell
   npm run db:init
   npm run db:seed
   ```

5. Inicia el servidor backend:
   ```powershell
   npm run dev
   # O en modo compilado:
   npm run build
   npm start
   ```
   El backend estará disponible en `http://localhost:3001`.

---

### Paso 2: Configurar el Frontend

1. En una nueva terminal, entra al directorio del frontend:
   ```powershell
   cd frontend
   ```
2. Instala las dependencias:
   ```powershell
   npm install
   ```
3. Inicia la consola web:
   ```powershell
   npm run dev
   ```
   La consola web estará disponible en `http://localhost:3000` (o `http://localhost:5173`).

---

## 5. Cuenta Administradora

Configura `ADMIN_EMAIL` y `ADMIN_PASSWORD` en `backend/.env` antes de ejecutar `npm run db:seed`. No hay credenciales administrativas compartidas por defecto.

---

## 6. Guía de Uso: Crear y Desplegar Proyectos

### 1. Iniciar Sesión
Ingresa con las credenciales de administrador indicadas arriba.

### 2. Crear un Proyecto
1. En el Dashboard o en la pestaña **Projects**, haz clic en **+ New Project**.
2. Escribe el nombre del proyecto (ej. `Tienda Web React` o `API Pagos`).
3. Haz clic en **Create Project**. Serás redirigido a la vista de detalle del proyecto.

### 3. Subir y Desplegar (ZIP)
1. En la pestaña **Deploy & Pipeline**, arrastra o selecciona tu archivo `.zip` del proyecto.
   - *Nota*: Puedes utilizar cualquiera de los proyectos de prueba incluidos en la carpeta `test-projects/`:
     - `test-projects/vite-react-demo.zip` (Frontend React + Vite)
     - `test-projects/express-demo.zip` (Backend Node.js Express)
     - `test-projects/python-demo.zip` (Servicio Python)
2. Haz clic en **Start Deployment**.
3. Observa en tiempo real las 10 etapas del pipeline:
   - Extracción segura contra Zip Slip
   - Análisis de dependencias y detección de tipo de proyecto
   - Instalación de paquetes
   - Build de producción
   - Reserva de puerto en el pool 4000-5000
   - Lanzamiento del proceso nativo del sistema operativo
   - Verificación de Health Check HTTP
4. Una vez completado, verás el enlace público de tu aplicación (ej. `http://localhost:4000`) y su PID asignado en Windows.

### 4. Administrar el Ciclo de Vida
Desde la consola puedes:
- **Stop**: Detener la aplicación (mata el árbol de procesos nativo con `taskkill /T /F`).
- **Start**: Arrancar de nuevo la aplicación en su puerto asignado.
- **Restart**: Reiniciar el proceso de manera segura.
- **Delete**: Eliminar el proyecto, liberar el puerto en el pool y purgar el directorio del disco.
- **Real-time Logs**: Visualizar los logs de ejecución continua vía Server-Sent Events (SSE).

---

## 7. Limitaciones Reales

Para mantener honestidad y cero simulación de funcionalidades:
1. **Aislamiento a nivel de SO**: Al no usar Docker ni contenedores (cgroups/namespaces de Linux), el aislamiento entre proyectos se realiza a nivel de proceso (`child_process.spawn()`), directorio exclusivo y puertos distintos. No existe virtualización de kernel ni cuotas forzadas de CPU/memoria a nivel de cgroups en Windows.
2. **Dependencias del Sistema**: Los runtimes (Node.js, Python, Java, PHP) deben estar instalados globalmente en la máquina anfitriona para que sus respectivos proyectos puedan ejecutarse.
3. **Puertos de Red**: El rango predeterminado es `4000-5000`. Si un puerto de ese rango ya está siendo utilizado por un software ajeno en el sistema operativo, MyCloud lo detecta mediante sockets de red y pasa automáticamente al siguiente puerto libre.
