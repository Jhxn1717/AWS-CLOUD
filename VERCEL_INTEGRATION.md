# MyCloud con Vercel

## Arquitectura funcional

- **Consola React**: desplegada en Vercel desde `frontend/`.
- **API y worker MyCloud**: servicio Node persistente. Procesa ZIP y sube los archivos fuente a Vercel mediante su API REST. No desplegar este worker como función serverless.
- **Base de datos MyCloud**: PostgreSQL administrado en Neon o Supabase usando `DATABASE_URL` y TLS.
- **Aplicaciones de usuarios**: un Vercel Project por proyecto MyCloud; cada deployment de producción devuelve su URL `*.vercel.app`.

PlanetScale es MySQL y no es compatible con el driver PostgreSQL actual. Vercel tampoco puede ejecutar procesos de aplicación con puertos persistentes; los proyectos subidos deben ser compatibles con los runtimes/builds de Vercel.

## 1. PostgreSQL

Crea la base en Neon o Supabase y guarda la cadena de conexión solo en el entorno privado del backend:

```dotenv
DATABASE_URL=postgresql://USUARIO:CLAVE@HOST:5432/BASE
DB_SSL=true
DB_POOL_MAX=5
```

Inicializa el esquema y el administrador desde `backend/`:

```bash
npm run db:init
npm run db:seed
```

Configura `ADMIN_EMAIL` y `ADMIN_PASSWORD` antes del seed.

## 2. Backend y worker persistentes

El host del backend debe usar Node.js 20 o superior, conservar espacio temporal para extraer ZIP y mantener el proceso encendido durante el pipeline. Configura en sus variables privadas:

```dotenv
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://USUARIO:CLAVE@HOST:5432/BASE
DB_SSL=true
DB_POOL_MAX=5
JWT_SECRET=SECRETO_ALEATORIO_LARGO
ADMIN_NAME=MyCloud Admin
ADMIN_EMAIL=admin@tu-dominio.com
ADMIN_PASSWORD=CLAVE_SEGURA_DE_12_CARACTERES_O_MAS
VERCEL_ENABLED=true
VERCEL_TOKEN=TOKEN_PRIVADO_DE_VERCEL
VERCEL_TEAM_ID=
CORS_ORIGINS=https://tu-consola.vercel.app
```

Crea el token en [Vercel Account Tokens](https://vercel.com/account/tokens) con permisos para crear proyectos, gestionar variables de entorno y deployments. No pongas el token ni claves en el frontend, README o GitHub.

## 3. Consola React en Vercel

Importa el repositorio y configura:

- Root Directory: `frontend`
- Build command: `npm run build`
- Output directory: `dist`
- Environment variable: `VITE_API_URL=https://api.tu-dominio.com/api`

El origen del frontend debe coincidir con una entrada exacta de `CORS_ORIGINS` en el backend.

## 4. Publicar proyectos

1. MyCloud recibe el ZIP/GitHub en el backend persistente y extrae el código.
2. El analizador detecta la raíz y el framework del proyecto sin instalar dependencias localmente.
3. MyCloud crea o reutiliza el Vercel Project correspondiente.
4. Las variables de la aplicación se guardan en Vercel como variables cifradas.
5. MyCloud crea el deployment con `POST /v13/deployments` y consulta su estado hasta `READY` o `ERROR`; Vercel ejecuta instalación y build remotamente.
6. MyCloud persiste la URL devuelta y la muestra en la ficha del proyecto.

Cada nombre de proyecto es estable para que los siguientes deployments actualicen la misma app. El límite real de runtimes y tamaño/build de Vercel sigue aplicando; no todos los proyectos arbitrarios son compatibles.

## Dominios personalizados

Vercel asigna el dominio `vercel.app` del proyecto. Los dominios propios/subdominios requieren configuración y validación DNS en Vercel; MyCloud aún no los asocia automáticamente.

## Comprobación

- API: `https://api.tu-dominio.com/api/health`
- Frontend: abre el dominio de producción de Vercel e inicia sesión con las credenciales configuradas en el backend.
- Prueba primero un ZIP pequeño de Vite/React antes de usar proyectos con APIs o bases de datos propias.
