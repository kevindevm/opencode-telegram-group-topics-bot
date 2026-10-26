# Revert OpenCodeTelegramBot to LocalSystem (no password needed) and make
# `opencode` resolvable for it via the machine PATH. UAC Yes is enough.
$ErrorActionPreference = "Stop"
$svc = "OpenCodeTelegramBot"

Write-Host "1/3 Revirtiendo logon a LocalSystem..."
& sc.exe config $svc obj= LocalSystem
if ($LASTEXITCODE -ne 0) { Write-Host "sc.exe config falló."; pause; exit 1 }

Write-Host "2/3 Agregando npm global al PATH de máquina..."
$npmDir = Join-Path $env:APPDATA "npm"
$machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
if ($machinePath -split ";" -notcontains $npmDir) {
    [Environment]::SetEnvironmentVariable("Path", "$machinePath;$npmDir", "Machine")
    Write-Host "PATH actualizado (aplica a procesos nuevos)."
} else {
    Write-Host "PATH ya lo incluía."
}

Write-Host "3/3 Arrancando el servicio..."
& sc.exe start $svc
Start-Sleep -Seconds 15
& sc.exe query $svc | Select-String "ESTADO"
Write-Host "Listo. Verificá en Telegram: /status y /display."
pause
