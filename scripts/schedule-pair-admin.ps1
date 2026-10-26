# Run OpenCode pair at logon with highest privileges (no UAC prompt on logon).
# Run ELEVATED once. Replaces the Startup .lnk (deleted below).
$ErrorActionPreference = "Stop"
$taskName = "OpenCode Pair"
$ps = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$waitAndPair = '$n=0; while ($n -lt 24) { try { $c=New-Object Net.Sockets.TcpClient; $w=$c.BeginConnect(''127.0.0.1'',49374,$null,$null); if ($w.AsyncWaitHandle.WaitOne(1000)) { $c.EndConnect($w); $c.Close(); break } $c.Close() } catch {}; Start-Sleep 5; $n++ }; opencode pair | Out-Null'

Write-Host "1/3 Borrando atajo de Startup (lo reemplaza la tarea)..."
Remove-Item "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\OpenCode Pair.lnk" -Force -ErrorAction SilentlyContinue
Write-Host "OK."

Write-Host "2/3 Registrando tarea programada (logon, privilegios maximos)..."
$action = New-ScheduledTaskAction -Execute $ps -Argument "-WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -Command `"$waitAndPair`"" -WorkingDirectory $env:USERPROFILE
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:COMPUTERNAME\$env:USERNAME"
$principal = New-ScheduledTaskPrincipal -UserId "$env:COMPUTERNAME\$env:USERNAME" -LogonType Interactive -RunLevel Highest
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
Write-Host "OK."

Write-Host "3/3 Verificando..."
& schtasks /query /tn $taskName /v /fo list | Select-String -Pattern "Nombre de tarea|Estado|Nivel de ejec|Desencadenador|Usuario"
pause
