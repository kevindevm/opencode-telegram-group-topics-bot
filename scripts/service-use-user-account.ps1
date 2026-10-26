# One-time migration: run OpenCodeTelegramBot as the interactive user instead of
# LocalSystem, so `opencode` is on PATH and HOME/config/state match the CLI.
# Run ELEVATED. The Windows password is asked through a GUI prompt (Get-Credential)
# and never touches chat, logs, or the repo.
$ErrorActionPreference = "Stop"
$svc = "OpenCodeTelegramBot"
$acct = "$env:COMPUTERNAME\$env:USERNAME"

$cred = Get-Credential -UserName $acct -Message "Password de $acct para correr el servicio $svc"
if (-not $cred) {
  Write-Host "Cancelado por el usuario."
  pause
  exit 1
}

Write-Host "1/3 Configurando logon del servicio..."
& sc.exe config $svc obj= $acct password= $cred.GetNetworkCredential().Password
if ($LASTEXITCODE -ne 0) {
  Write-Host "sc.exe config falló con código $LASTEXITCODE."
  pause
  exit 1
}

Write-Host "2/3 Otorgando 'Log on as a service' (se preservan las cuentas existentes)..."
$sid = (New-Object Security.Principal.NTAccount($acct)).Translate(
  [Security.Principal.SecurityIdentifier]
).Value
$cfg = Join-Path $env:TEMP "svc-rights.inf"
$db = Join-Path $env:TEMP "svc-rights.sdb"
& secedit /export /cfg $cfg /quiet | Out-Null
$lines = Get-Content $cfg
$line = $lines | Where-Object { $_ -match '^SeServiceLogonRight\s*=' } | Select-Object -First 1
if ($line) {
  if ($line -notmatch [regex]::Escape("*$sid")) {
    $lines = $lines -replace '^SeServiceLogonRight\s*=.*', ($line.TrimEnd() + ",*$sid")
  }
} else {
  $idx = ($lines | Select-String '^\[Privilege Rights\]').LineNumber
  $lines = $lines[0..($idx - 1)] + "SeServiceLogonRight = *$sid" + $lines[$idx..($lines.Count - 1)]
}
$lines | Set-Content $cfg
& secedit /configure /db $db /cfg $cfg /areas USER_RIGHTS /quiet | Out-Null
Write-Host "Derecho otorgado."

Write-Host "3/3 Reiniciando el servicio..."
Restart-Service $svc -Force
Start-Sleep -Seconds 12
Get-Service $svc | Format-Table Name, Status, StartType -AutoSize
& sc.exe qc $svc | Select-String "SERVICE_START_NAME"
Write-Host ""
Write-Host "Listo. Verificá en Telegram: /status y /display."
pause
