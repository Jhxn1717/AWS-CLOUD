$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$localPath = Join-Path $PSScriptRoot '.local'
$pgCtl = Join-Path $localPath 'pgsql/bin/pg_ctl.exe'
$pgData = Join-Path $localPath 'pgdata'
if (!(Test-Path $pgCtl) -or !(Test-Path "$pgData/PG_VERSION")) {
    throw 'PostgreSQL local no esta preparado en .local.'
}
& $pgCtl status -D $pgData *> $null
if ($LASTEXITCODE -ne 0) {
    & $pgCtl start -D $pgData -l "$localPath/postgresql.log" -w
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo iniciar PostgreSQL.' }
}
$node = (Get-Command node.exe).Source
$runtimePathFile = Join-Path $localPath 'node-runtime-path.txt'
if (Test-Path $runtimePathFile) {
    $runtimePath = (Get-Content $runtimePathFile -Raw).Trim()
    if (Test-Path "$runtimePath/node.exe") {
        $node = Join-Path $runtimePath 'node.exe'
        $env:Path = "$runtimePath;$env:Path"
    }
}
function Start-LocalServer($Name, $Directory, $Arguments, $Url) {
    try {
        $response = Invoke-WebRequest $Url -TimeoutSec 2 -UseBasicParsing
        if ($response.StatusCode -eq 200) { return }
    } catch {}
    $process = Start-Process -FilePath $node -ArgumentList $Arguments -WorkingDirectory $Directory -WindowStyle Hidden -PassThru -RedirectStandardOutput "$localPath/$Name.stdout.log" -RedirectStandardError "$localPath/$Name.stderr.log"
    $process.Id | Set-Content "$localPath/$Name.pid"
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Seconds 1
        if ($process.HasExited) { throw "$Name termino. Revisa .local/$Name.stderr.log" }
        try {
            $response = Invoke-WebRequest $Url -TimeoutSec 2 -UseBasicParsing
            if ($response.StatusCode -eq 200) { return }
        } catch {}
    }
    throw "$Name no responde. Revisa los logs en .local."
}
Start-LocalServer 'backend' "$PSScriptRoot/backend" 'dist/index.js' 'http://127.0.0.1:3001/api/health'
Start-LocalServer 'frontend' "$PSScriptRoot/frontend" 'node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort' 'http://127.0.0.1:5173'
Write-Host 'MyCloud disponible en http://localhost:5173'
Write-Host 'Credenciales de acceso: ADMIN_EMAIL y ADMIN_PASSWORD en backend/.env'
