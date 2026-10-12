# Guía: MyCloud + Vercel (Despliegue Web)

## ¿Qué es esto?

MyCloud ahora puede desplegar proyectos directamente en **Vercel** en lugar de usar procesos locales. Esto permite que:

- ✅ Tu MyCloud se despliegue en una URL (ej: `https://tudominio.com`)
- ✅ Cada proyecto desplegado tenga su propia URL en `vercel.app`
- ✅ Sin necesidad de VM ni puertos locales
- ✅ Escalabilidad automática

---

## Arquitectura

```
Internet
   │
   ▼
┌─────────────────────────────────────────┐
│  MyCloud (desplegado en Vercel)         │
│  https://tudominio.vercel.app           │
└─────────────────────────────────────────┘
   │
   ├─ Login / Auth
   ├─ Upload ZIP
   ├─ Listar proyectos
   │
   ▼
┌─────────────────────────────────────────┐
│  Project 1 (Vercel)                     │
│  https://proyecto1-abc123.vercel.app    │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  Project 2 (Vercel)                     │
│  https://proyecto2-xyz999.vercel.app    │
└─────────────────────────────────────────┘
```

---

## Cómo Configurar

### Paso 1: Obtener Token de Vercel

1. Ve a [vercel.com](https://vercel.com)
2. Inicia sesión
3. Ve a [Account → Settings → Tokens](https://vercel.com/account/tokens)
4. Crea un token nuevo con permisos:
   - `Read Projects`
   - `Read & Write Deployments`
   - `Read Environments`
   - `Read Teams`

### Paso 2: Configurar MyCloud

Crea un archivo `.env` en `mycloud/backend/`:

```env
# Habilitar Vercel
VERCEL_ENABLED=true
VERCEL_TOKEN=tu_token_aqui
VERCEL_TEAM_ID=team_XXX  # opcional

# Configuración normal
PORT=3001
DB_HOST=localhost
DB_NAME=mycloud_platform
...
```

### Paso 3: Iniciar MyCloud

```bash
cd mycloud/backend
npm run dev
```

---

## Cómo Usar

### 1. Desplegar un Proyecto

1. Abre `http://localhost:3000`
2. Inicia sesión
3. Crea un nuevo proyecto
4. Sube tu ZIP (o usa GitHub)
5. Haz clic en "Deploy"

**Resultado:**
- MyCloud envía el ZIP a Vercel
- Vercel despliega el proyecto
- MyCloud guarda la URL en la base de datos

### 2. Ver tu Proyecto

En la pantalla de detalle del proyecto verás:

```
URL: https://proyecto-abc123.vercel.app
```

Haz clic para abrirlo.

### 3. Actualizar Proyectos

- Vercel detecta automáticamente cambios si conectas tu repo
- O sube un nuevo ZIP

---

## Ventajas de usar Vercel

| Característica | MyCloud Local | MyCloud + Vercel |
|----------------|---------------|------------------|
| URL | `localhost:4000` | `https://tudominio.com` |
| Escalabilidad | Manual | Automática |
| SSL |手动 | Incluido |
| CDN | No | Sí |
| Infraestructura | VM propia | Vercel |
| Costo | Gratis (local) | Free/Paid en Vercel |

---

## Limitaciones

1. **Límites de Vercel**:
   - Build time: 60 min (Free), 2h (Pro)
   - Bandwidth: 100 GB/mes (Free)
   - Deployments: Ilimitados

2. **No puedes usar puertos personalizados**:
   - Vercel usa puertos dinámicos
   - No puedes exponer múltiples servicios en diferentes puertos

3. **Variables de entorno**:
   - Configúralas en la configuración del proyecto en Vercel
   - O pasa `VERCEL_ENV_XXX` en MyCloud

---

## Alternativa: MyCloud sin Vercel (Local)

Si **no** quieres usar Vercel, solo deshabilita:

```env
VERCEL_ENABLED=false
```

MyCloud usará la arquitectura original (procesos locales en puertos 4000-5000).

---

## Troubleshooting

### Error: "Vercel API error: 401"

- Verifica que tu token sea correcto
- Verifica que el token tenga los permisos necesarios

### Error: "No available ports"

- Esto no aplica si usas Vercel
- Vercel maneja los puertos automáticamente

### Error: "Build failed"

- Revisa los logs de Vercel en la consola
- Asegúrate de que tu proyecto tenga un script `build` en `package.json`

---

## Costos

### Vercel Free Tier
- ✅ 100 GB bandwidth/mes
- ✅ 60 min build time
- ✅ Ilimitados proyectos
- ✅ SSL incluido

**¿Es gratis para mi uso?**
- ✅ Sí, si tu uso es modesto
- ✅ Sí, para presentaciones y demos
- ❌ No, si necesitas bandwidth elevado

---

## Conclusión

**MyCloud con Vercel es perfecto si:**
- Quieres que tu plataforma sea accesible desde internet
- No quieres configurar infraestructura
- Quieres URL bonitas (`.vercel.app`)
- Tu uso es modesto (menos de 100GB/mes)

**MyCloud Local es perfecto si:**
- Quieres más control sobre el entorno
- No te importa configurar VM
- Necesitas puertos personalizados
- Quieres evitar límites de Vercel

---

## ¿Qué prefieres?

1. **Usar Vercel** (recomendado para presentación)
   - Despliega MyCloud en Vercel
   - Proyectos se despliegan en `vercel.app`
   - Sin infraestructura

2. **Usar local** (para pruebas)
   - MyCloud en tu máquina
   - Proyectos en puertos 4000-5000
   - Sin internet necesario

Dime y te ayudo a implementar la opción que elijas.
