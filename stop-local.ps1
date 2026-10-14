$ErrorActionPreference = 'Stop'
$localPath = Join-Path $PSScriptRoot '.local'
$managerPidFile = Join-Path $localPath 'project-tunnels.pid'
if (Test-Path $managerPidFile) {
    $managerId = [int](Get-Content $managerPidFile)
    $managerProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $managerId" -ErrorAction SilentlyContinue
    if ($managerProcess -and $managerProcess.Name -eq 'node.exe' -and $managerProcess.CommandLine.Contains('publicar-proyectos.cjs')) {
        & taskkill.exe /PID $managerId /T /F | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'No se pudieron detener los tuneles de proyectos.' }
    }
    Remove-Item -LiteralPath $managerPidFile
    $publicLinks = Join-Path $PSScriptRoot 'frontend/public/project-tunnels.json'
    if (Test-Path $publicLinks) { Set-Content -LiteralPath $publicLinks -Value '{}' -Encoding ASCII }
}
foreach ($name in @('frontend', 'backend')) {
    $pidFile = Join-Path $localPath "$name.pid"
    if (Test-Path $pidFile) {
        $serverId = [int](Get-Content $pidFile)
        $process = Get-CimInstance Win32_Process -Filter "ProcessId = $serverId" -ErrorAction SilentlyContinue
        $expectedCommand = if ($name -eq 'frontend') { 'node_modules/vite/bin/vite.js' } else { 'dist/index.js' }
        if ($process -and $process.Name -eq 'node.exe' -and $process.CommandLine.Contains($expectedCommand)) {
            Stop-Process -Id $serverId
        }
        Remove-Item -LiteralPath $pidFile
    }
}
$pgCtl = Join-Path $localPath 'pgsql/bin/pg_ctl.exe'
if (Test-Path $pgCtl) {
    & $pgCtl status -D "$localPath/pgdata" *> $null
    if ($LASTEXITCODE -eq 0) { & $pgCtl stop -D "$localPath/pgdata" -m fast -w }
}
Write-Host 'Servicios locales detenidos.'
