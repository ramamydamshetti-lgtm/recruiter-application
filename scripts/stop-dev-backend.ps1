# Stops only Node processes running Recruiter Application_Dev\backend (not live).
$procs = Get-CimInstance Win32_Process -Filter "name='node.exe'" |
  Where-Object { $_.CommandLine -match 'Recruiter Application_Dev\\backend' }

if (-not $procs) {
  Write-Host "No dev backend Node processes found."
  exit 0
}

foreach ($p in $procs) {
  Write-Host "Stopping PID $($p.ProcessId) ..."
  taskkill /PID $p.ProcessId /F 2>$null
}

Write-Host "Done. Live backend (Recruiter Application, port 8000) was not targeted."
