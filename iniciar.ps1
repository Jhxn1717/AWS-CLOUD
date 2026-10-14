param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$localPath = Join-Path $PSScriptRoot '.local'
$pgCtl = Join-Path $localPath 'pgsql/bin/pg_ctl.exe'
$pgData = Join-Path $localPath 'pgdata'
foreach ($required in @($pgCtl, "$pgData/PG_VERSION", "$PSScriptRoot/backend/.env", "$PSScriptRoot/backend/node_modules/typescript/bin/tsc", "$PSScriptRoot/frontend/node_modules/vite/bin/vite.js")) {
    if (!(Test-Path -LiteralPath $required)) { throw "Falta $required. Prepara primero el entorno local del proyecto." }
}
$node = (Get-Command node.exe).Source
if (Test-Path "$localPath/node-runtime-path.txt") {
    $runtimePath = (Get-Content "$localPath/node-runtime-path.txt" -Raw).Trim()
    if (Test-Path "$runtimePath/node.exe") { $node = "$runtimePath/node.exe"; $env:Path = "$runtimePath;$env:Path" }
}
$cloudflared = Join-Path $localPath 'cloudflared.exe'
if (!(Test-Path $cloudflared)) {
    $installed = Get-Command cloudflared.exe -ErrorAction SilentlyContinue
    if ($installed) { $cloudflared = $installed.Source }
}
if ($CheckOnly) {
    Write-Host "Prerequisitos OK. Node: $node"
    Write-Host 'Frontend: 5173. Backend: 3001. PostgreSQL: configuracion local.'
    if (Test-Path $cloudflared) { & $cloudflared --version }
    else { Write-Host 'cloudflared se descargara de Cloudflare al iniciar.' }
    Write-Host 'No se iniciaron servicios ni se publico un tunel.'
    exit 0
}
if (!(Test-Path $cloudflared)) {
    Write-Host 'Descargando cloudflared oficial (primera ejecucion)...'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile "$cloudflared.download" -UseBasicParsing
    Move-Item -LiteralPath "$cloudflared.download" -Destination $cloudflared -Force
}
& $cloudflared --version
if ($LASTEXITCODE -ne 0) { throw 'cloudflared no se pudo ejecutar.' }
& $pgCtl status -D $pgData *> $null
if ($LASTEXITCODE -ne 0) {
    & $pgCtl start -D $pgData -l "$localPath/postgresql.log" -w
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL no pudo iniciar.' }
}
$backendReady = $false
try { $backendReady = (Invoke-WebRequest 'http://127.0.0.1:3001/api/health' -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200 } catch {}
if (!$backendReady) {
    Write-Host 'Compilando backend...'
    Push-Location "$PSScriptRoot/backend"
    try { & $node 'node_modules/typescript/bin/tsc'; if ($LASTEXITCODE -ne 0) { throw 'La compilacion del backend fallo.' } }
    finally { Pop-Location }
}
foreach ($service in @('backend', 'frontend')) {
    Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSScriptRoot/terminal-local.ps1`" -Service $service" -WorkingDirectory $PSScriptRoot -WindowStyle Normal | Out-Null
}
Write-Host 'Esperando a que frontend y backend respondan...'
$ready = $false
for ($attempt = 0; $attempt -lt 60; $attempt++) {
    try {
        $health = Invoke-RestMethod 'http://127.0.0.1:3001/api/health' -TimeoutSec 2
        $frontend = Invoke-WebRequest 'http://127.0.0.1:5173' -UseBasicParsing -TimeoutSec 2
        $proxy = Invoke-RestMethod 'http://127.0.0.1:5173/api/health' -TimeoutSec 2
        if ($health.success -and $frontend.StatusCode -eq 200 -and $proxy.success) { $ready = $true; break }
    } catch {}
    Start-Sleep -Seconds 1
}
if (!$ready) { throw 'Frontend o backend no respondieron a tiempo. Revisa sus terminales. No se inicio el tunel.' }
Write-Host ''
Write-Host 'Servicios listos. Creando tunel HTTPS para el panel MyCloud...'
Write-Host 'Copia el enlace https://....trycloudflare.com que aparecera abajo.'
Write-Host 'Manten esta terminal abierta. Ctrl+C cierra el tunel.'
& "$PSScriptRoot/publicar-proyectos.ps1"
Write-Host 'Los proyectos en ejecucion recibiran enlaces publicos propios en el panel.'
Write-Host 'Los Quick Tunnels no soportan logs SSE; usa un tunel administrado si necesitas streaming.'
Write-Host ''
# Explicit config avoids a pre-existing user tunnel configuration affecting this quick tunnel.
$quickConfig = Join-Path $localPath 'cloudflare-quick.yml'
Set-Content -LiteralPath $quickConfig -Value '{}' -Encoding ASCII
& $cloudflared tunnel --config $quickConfig --url http://127.0.0.1:5173 --http-host-header localhost:5173
if ($LASTEXITCODE -ne 0) { throw "cloudflared termino con codigo $LASTEXITCODE." }
