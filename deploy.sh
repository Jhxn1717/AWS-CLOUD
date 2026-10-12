#!/bin/bash

# Script de despliegue para MyCloud PaaS
# Uso: bash deploy.sh

set -e

echo "=== MyCloud PaaS - Despliegue Script ==="
echo ""

# Verificar si está corriendo como root
if [ "$EUID" -eq 0 ]; then 
    echo "⚠️  No ejecutes este script como root"
    exit 1
fi

# Variables
BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/backend"
PORT=3001

# Funciones
print_success() {
    echo "✅ $1"
}

print_error() {
    echo "❌ $1"
}

print_info() {
    echo "ℹ️  $1"
}

# Verificar dependencias
check_dependencies() {
    print_info "Verificando dependencias..."
    
    if ! command -v node &> /dev/null; then
        print_error "Node.js no está instalado"
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        print_error "npm no está instalado"
        exit 1
    fi
    
    if ! command -v psql &> /dev/null; then
        print_error "PostgreSQL no está instalado"
        exit 1
    fi
    
    print_success "Todas las dependencias están instaladas"
}

# Configurar base de datos
setup_database() {
    print_info "Configurando base de datos..."
    
    # Verificar si la base de datos existe
    if ! psql -U postgres -lqt | cut -d \| -f 1 | grep -qw mycloud_platform; then
        print_info "Creando base de datos mycloud_platform..."
        sudo -u postgres psql -c "CREATE DATABASE mycloud_platform;"
    else
        print_success "La base de datos ya existe"
    fi
    
    # Ejecutar scripts de inicialización
    print_info "Inicializando schema..."
    cd "$BACKEND_DIR"
    npx ts-node src/scripts/initDb.ts
    print_success "Schema inicializado"
    
    print_info "Creando usuario admin..."
    npx ts-node src/scripts/seedDb.ts
    print_success "Usuario admin creado"
}

# Iniciar backend
start_backend() {
    print_info "Iniciando backend..."
    cd "$BACKEND_DIR"
    
    # Compilar
    npm run build
    print_success "Backend compilado"
    
    # Iniciar en segundo plano
    nohup npm start > logs/app.log 2>&1 &
    BACKEND_PID=$!
    
    echo $BACKEND_PID > .backend.pid
    print_success "Backend iniciado con PID: $BACKEND_PID"
}

# Mostrar información de acceso
show_info() {
    echo ""
    echo "=== Información de Acceso ==="
    echo ""
    echo "🌐 URL del Frontend: http://localhost:5173"
    echo "🔌 URL del Backend: http://localhost:$PORT"
    echo ""
    echo "🔐 Acceso: usa ADMIN_EMAIL y ADMIN_PASSWORD configurados en backend/.env"
    echo ""
    echo "📝 Ver logs: tail -f $BACKEND_DIR/logs/app.log"
    echo "🛑 Detener: bash deploy.sh stop"
    echo ""
}

# Detener backend
stop_backend() {
    print_info "Deteniendo backend..."
    if [ -f "$BACKEND_DIR/.backend.pid" ]; then
        PID=$(cat "$BACKEND_DIR/.backend.pid")
        kill $PID 2>/dev/null || true
        rm -f "$BACKEND_DIR/.backend.pid"
        print_success "Backend detenido"
    else
        print_error "No se encontró el PID del backend"
    fi
}

# Mostrar ayuda
show_help() {
    echo "Uso: bash deploy.sh [comando]"
    echo ""
    echo "Comandos:"
    echo "  deploy    Instalar y启动 backend (por defecto)"
    echo "  stop      Detener backend"
    echo "  status    Ver estado"
    echo "  logs      Ver logs en tiempo real"
    echo "  help      Mostrar esta ayuda"
}

# Main
case "${1:-deploy}" in
    deploy)
        check_dependencies
        setup_database
        start_backend
        show_info
        ;;
    stop)
        stop_backend
        ;;
    status)
        if [ -f "$BACKEND_DIR/.backend.pid" ]; then
            PID=$(cat "$BACKEND_DIR/.backend.pid")
            if kill -0 $PID 2>/dev/null; then
                print_success "Backend está corriendo (PID: $PID)"
            else
                print_error "Backend no está corriendo (PID: $PID)"
            fi
        else
            print_error "Backend no está corriendo"
        fi
        ;;
    logs)
        tail -f "$BACKEND_DIR/logs/app.log"
        ;;
    *)
        show_help
        ;;
esac
