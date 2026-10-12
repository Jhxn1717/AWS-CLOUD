# Guía de Despliegue de MyCloud PaaS

## 📋 Opciones de Despliegue

### Opción 1: DigitalOcean Droplet (Recomendado)

#### 1. Crear Droplet
1. Ve a [digitalocean.com](https://www.digitalocean.com)
2. Crea un nuevo Droplet
3. Configuración recomendada:
   - **Imagen**: Ubuntu 22.04 LTS
   - **Plan**: Basic - $6/mes (1 vCPU, 1GB RAM, 25GB SSD)
   - **Datacenter**: Lima, Perú (para menor latencia)
   - **Authentication**: SSH Key (recomendado) o Contraseña

#### 2. Configurar el Servidor

Conéctate por SSH:
```bash
ssh root@TU_IP_PUBLICA
```

Instala las dependencias:
```bash
# Actualizar sistema
apt update && apt upgrade -y

# Instalar Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
apt-get install -y nodejs

# Instalar PostgreSQL
apt-get install -y postgresql postgresql-contrib

# Instalar Git
apt-get install -y git

# Verificar instalaciones
node --version
npm --version
psql --version
```

#### 3. Configurar Base de Datos

```bash
# Iniciar PostgreSQL
service postgresql start

# Crear usuario y base de datos
sudo -u postgres psql <<EOF
CREATE USER mycloud_admin WITH PASSWORD 'tu_contraseña_segura';
CREATE DATABASE mycloud_platform OWNER mycloud_admin;
GRANT ALL PRIVILEGES ON DATABASE mycloud_platform TO mycloud_admin;
\q
EOF

# Permitir conexiones remotas
echo "listen_addresses = '*'" >> /etc/postgresql/14/main/postgresql.conf
echo "host all all 0.0.0.0/0 md5" >> /etc/postgresql/14/main/pg_hba.conf

# Reiniciar PostgreSQL
service postgresql restart
```

#### 4. Desplegar MyCloud

```bash
# Clonar tu repositorio (si tienes uno)
git clone TU_REPOSITORIO mycloud
cd mycloud/backend

# Configurar variables de entorno
cp .env.example .env
nano .env

# Editar .env con:
PORT=3001
NODE_ENV=production
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mycloud_platform
DB_USER=mycloud_admin
DB_PASSWORD=tu_contraseña_segura
JWT_SECRET=tu_jwt_super_secreto_aqui
PROJECTS_BASE_PATH=./projects
UPLOADS_PATH=./uploads
LOGS_PATH=./logs
PORT_RANGE_START=4000
PORT_RANGE_END=5000

# Inicializar base de datos
npx ts-node src/scripts/initDb.ts
npx ts-node src/scripts/seedDb.ts

# Compilar y ejecutar
npm run build
nohup npm start > logs/app.log 2>&1 &
```

#### 5. Crear Servicio systemd

```bash
# Crear archivo de servicio
nano /etc/systemd/system/mycloud.service
```

Contenido:
```ini
[Unit]
Description=MyCloud PaaS Platform
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=/root/mycloud/backend
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3001

[Install]
WantedBy=multi-user.target
```

```bash
# Iniciar servicio
systemctl daemon-reexec
systemctl enable mycloud
systemctl start mycloud
systemctl status mycloud
```

#### 6. Configurar Firewall

```bash
ufw allow OpenSSH
ufw allow 3001/tcp
ufw allow 4000:5000/tcp
ufw enable
```

---

### Opción 2: AWS EC2

1. Crea una instancia t2.micro (gratuita)
2. Instala las mismas dependencias que en DigitalOcean
3. Configura el Security Group para abrir puertos 3001 y 4000-5000
4. Usa el mismo script de despliegue

---

### Opción 3: Render (Web Service)

Render tiene limitaciones para este tipo de aplicaciones que requieren múltiples puertos. No recomendado.

---

## 🔧 Configuración Post-Despliegue

### 1. Frontend

Despliega el frontend en Vercel:

```bash
cd frontend
vercel
```

Configura las variables de entorno:
```
VITE_API_URL=https://tu-dominio.com
```

### 2. DNS

Configura un dominio personalizado:
```
API: api.tu-dominio.com → IP del servidor
FRONTEND: app.tu-dominio.com → Vercel
```

### 3. HTTPS

#### En DigitalOcean (con Nginx):
```bash
# Instalar Nginx
apt-get install -y nginx

# Configurar proxy reverso
nano /etc/nginx/sites-available/mycloud
```

Contenido:
```nginx
server {
    listen 80;
    server_name api.tu-dominio.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Habilitar sitio
ln -s /etc/nginx/sites-available/mycloud /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx

# Configurar SSL con Certbot
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d api.tu-dominio.com
```

---

## 📊 Verificación

Después del despliegue:

1. **API**: `https://api.tu-dominio.com/api/health`
2. **Login**: `https://app.tu-dominio.com/login`
3. **Acceso inicial**: usa el email y la contraseña definidos en `ADMIN_EMAIL` y `ADMIN_PASSWORD` durante la configuración del backend.

---

## 🚨 Notas Importantes

1. **Seguridad**: Cambia el `JWT_SECRET` por un valor aleatorio seguro
2. **Database**: Usa contraseñas fuertes para PostgreSQL
3. **Puertos**: El rango 4000-5000 debe estar abierto en el firewall
4. **Backups**: Configura backups automáticos de PostgreSQL
5. **Monitoreo**: Usa herramientas como PM2 o systemd para monitorear el servicio

---

## 🛠️ Troubleshooting

### Error: "Address already in use"
```bash
lsof -i :3001
kill -9 [PID]
```

### Error: PostgreSQL conexión
```bash
# Verificar servicio
systemctl status postgresql

# Ver logs
tail -f /var/log/postgresql/postgresql-14-main.log
```

### Error: "No available ports"
```bash
# Verificar puertos en uso
netstat -tuln | grep :4000
```

---

## 💰 Costos Estimados

| Plataforma | Costo/Mes | Recursos |
|------------|-----------|----------|
| DigitalOcean Basic | $6 | 1 vCPU, 1GB RAM |
| AWS EC2 t2.micro | $0 (free tier) | 1 vCPU, 1GB RAM |
| DigitalOcean Pro | $12 | 2 vCPU, 2GB RAM |

---

**Nota**: Este es un proyecto educativo/prototipo. Para producción, considera usar Docker para mejor aislamiento y escalabilidad.
