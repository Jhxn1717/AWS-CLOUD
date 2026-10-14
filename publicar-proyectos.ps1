$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$localPath = Join-Path $PSScriptRoot '.local'
$pidFile = Join-Path $localPath 'project-tunnels.pid'
if (Test-Path $pidFile) {
    $managerId = [int](Get-Content $pidFile)
    $existing = Get-CimInstance Win32_Process -Filter "ProcessId = $managerId" -ErrorAction SilentlyContinue
    if ($existing -and $existing.CommandLine.Contains('publicar-proyectos.cjs')) { Write-Host 'Tuneles de proyectos ya activos.'; exit 0 }
}
$node = (Get-Command node.exe).Source
if (Test-Path "$localPath/node-runtime-path.txt") {
    $runtimePath = (Get-Content "$localPath/node-runtime-path.txt" -Raw).Trim()
    if (Test-Path "$runtimePath/node.exe") { $node = "$runtimePath/node.exe" }
}
$manager = Start-Process $node -ArgumentList "`"$PSScriptRoot/publicar-proyectos.cjs`"" -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput "$localPath/project-tunnels.stdout.log" -RedirectStandardError "$localPath/project-tunnels.stderr.log"
$manager.Id | Set-Content $pidFile
Write-Host 'Publicacion automatica de proyectos iniciada.'
