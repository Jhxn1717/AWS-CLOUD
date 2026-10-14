# Continuidad de MyCloud

Actualizado: 14 de octubre de 2026 (America/Lima).

## Repositorio y rama

- Repositorio público: https://github.com/Jhxn1717/AWS-CLOUD
- Rama de trabajo respaldada: codex/mycloud-backup-2026-10-14
- El remoto original `origin` apunta a vixhugo/AWS-CLOUD; el remoto `mycloud-backup` apunta a Jhxn1717/AWS-CLOUD. En una PC nueva, al clonar tu repositorio, `origin` apuntará a tu cuenta.
- Proyecto original local: C:\Users\jhonu\Music\AWS-CLOUD.

## Trabajo incluido

- Panel React/Vite remodelado, tema oscuro y botón de modo claro.
- API Express/TypeScript con mejoras de análisis, extracción ZIP, arranque, comprobaciones HTTP y gestión de procesos.
- Soporte de selección de versiones Node; prevalidación de Python, Java y PHP. No se garantiza que cualquier repositorio funcione sin configurar sus requisitos.
- Lanzadores Windows: iniciar.bat, iniciar.ps1, start-local.ps1, stop-local.ps1 y terminal-local.ps1.
- Publicación temporal: publicar-proyectos.ps1 y publicar-proyectos.cjs.
- Guía PDF: output/pdf/Guia_MyCloud.pdf.
- Última validación antes del respaldo: backend y frontend compilados; 18 pruebas de backend aprobadas.

## Qué NO está respaldado en GitHub

No se subieron archivos .env, contraseñas, tokens, bases de datos, binarios portables .local, node_modules, ZIP cargados ni código extraído de las aplicaciones desplegadas. Un clon nuevo no contiene los usuarios ni los proyectos de la instalación anterior. Si se necesita conservarlos, hay que preparar un respaldo privado por separado antes de perder acceso a la laptop.

## Cómo retomar en otra PC

1. Clonar la rama correcta:

   git clone --branch codex/mycloud-backup-2026-10-14 https://github.com/Jhxn1717/AWS-CLOUD.git

2. Abrir esa carpeta como proyecto en Codex y pedir que lea este archivo y README.md.
3. Preparar Node, PostgreSQL, dependencias y archivos de entorno nuevos a partir de las plantillas. Revisar los requisitos del README: iniciar.bat espera que el entorno local ya esté preparado.
4. Crear o restaurar la base de datos mediante los procedimientos del repositorio, con credenciales privadas. No publicar secretos en GitHub.
5. Verificar la compilación y el arranque local antes de crear un túnel.

El historial de esta conversación no está contenido en GitHub. Esta nota permite que otra conversación de Codex entienda el proyecto sin depender del historial ni del disco de la PC anterior.

## Puertos y Cloudflare

- Panel original: 5173. API original: 3001. Aplicaciones: puertos asignados dentro del rango configurado, habitualmente 4000-5000.
- Los enlaces trycloudflare.com son temporales. No asumir que una URL mencionada en una conversación siga vigente.
- Se produjo error 429 al solicitar túneles repetidamente. Tras esperar, volvió a funcionar el panel y se verificaron cuatro enlaces de proyectos. No crear bucles de reintentos rápidos si el error vuelve.
- La versión respaldada conserva el publicador anterior, por solicitud de revertir cambios. Revisa cada 15 segundos y puede volver a intentar tras un cierre. También se observó un bloqueo EPERM al reemplazar project-tunnels.json en Windows; las correcciones experimentales de reintentos y escritura fueron revertidas y NO están en esta rama.
- GitHub respalda código: no mantiene los procesos encendidos. Si se apaga la laptop, se apagan MyCloud y sus túneles.

## Preferencias y alcance

- El usuario pide cambios cuidadosos, sin dañar el sistema ni modificar otros proyectos cuando una tarea se limita a uno.
- Para pruebas con ngrok autorizó una copia aislada en otra conversación, sin modificar el original.
- La copia ngrok quedó fuera de este repositorio, en C:\Users\jhonu\Documents\Codex\2026-10-14\mycloud-ngrok-copia\outputs. Respondía en http://127.0.0.1:6301. La otra conversación reportó ngrok instalado, pendiente de configurar la cuenta/authtoken. Ese estado y esos archivos no se transfieren automáticamente a otra PC.
- No solicitar que se peguen tokens en el chat: configurarlos directamente en la máquina.

## Aplicaciones desplegadas y autenticación

Los proyectos cargados y sus bases son independientes del panel MyCloud. Una cuenta del panel no sirve automáticamente para iniciar sesión en otra aplicación. En el caso de SalesIA/Franchesco, Supabase autentica y la base empresarial necesita el usuario vinculado al UID y sus roles. No habilitar cuentas arbitrarias ni asumir que las credenciales de prueba documentadas funcionen.

Los ajustes locales de una aplicación extraída se pierden al volver a desplegar desde GitHub si no están incorporados en el repositorio de esa aplicación. El proyecto Franchesco creado después del encendido de MyCloud fue retirado al ejecutar una reversión solicitada; se guardó respaldo privado local, excluido de GitHub.
