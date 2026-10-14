param([Parameter(Mandatory = $true)][ValidateSet('backend', 'frontend')][string]$Service)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$Host.UI.RawUI.WindowTitle = "MyCloud - $Service"
$localPath = Join-Path $PSScriptRoot '.local'
$node = (Get-Command node.exe).Source
if (Test-Path "$localPath/node-runtime-path.txt") {
    $runtimePath = (Get-Content "$localPath/node-runtime-path.txt" -Raw).Trim()
    if (Test-Path "$runtimePath/node.exe") { $node = "$runtimePath/node.exe"; $env:Path = "$runtimePath;$env:Path" }
}
$url = if ($Service -eq 'backend') { 'http://127.0.0.1:3001/api/health' } else { 'http://127.0.0.1:5173' }
$alreadyRunning = $false
try { $alreadyRunning = (Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200 } catch {}
if ($alreadyRunning) {
    Write-Host "$Service ya esta activo en $url. Se reutiliza sin reiniciarlo."
    $logPath = Join-Path $localPath "$Service.stdout.log"
    if (Test-Path $logPath) { Get-Content -LiteralPath $logPath -Tail 25 -Wait }
    else { Read-Host 'Pulsa Enter para cerrar esta terminal' | Out-Null }
    exit
}
$arguments = if ($Service -eq 'backend') { 'dist/index.js' } else { 'node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort' }
Write-Host "Iniciando $Service en $url"
$process = Start-Process -FilePath $node -ArgumentList $arguments -WorkingDirectory "$PSScriptRoot/$Service" -NoNewWindow -PassThru
$process.Id | Set-Content "$localPath/$Service.pid"
Wait-Process -Id $process.Id
$process.Refresh()
if ($process.ExitCode -ne 0) { Write-Host "$Service termino con error $($process.ExitCode)"; Read-Host 'Pulsa Enter para cerrar' | Out-Null; exit 1 }
