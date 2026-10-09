# Restart app stack and verify health. Run as Administrator.
$ErrorActionPreference = 'Stop'
$deploy = $PSScriptRoot

# Stop legacy D:\Recruiter Application backends — they fight Dev on port 8000.
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine -like '*D:\Recruiter Application\backend*' } |
    ForEach-Object {
        Write-Host "Stopping legacy backend PID $($_.ProcessId) ..."
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
Start-Sleep -Seconds 2

Write-Host 'Stopping manual caddy processes...'
Get-Process caddy -EA SilentlyContinue | Stop-Process -Force -EA SilentlyContinue
Start-Sleep -Seconds 2

foreach ($svc in @('RecruiterApp-Backend','RecruiterApp-Frontend','RecruiterApp-Caddy')) {
    $s = Get-Service $svc -EA SilentlyContinue
    if (-not $s) { Write-Host "MISSING: $svc"; continue }
    if ($s.Status -eq 'Running') { Restart-Service $svc -Force }
    else { Start-Service $svc }
    Write-Host "Started $svc"
}

Start-Sleep -Seconds 15

Write-Host "`n=== Health ===" -ForegroundColor Cyan
@(80,3000,8000,443) | ForEach-Object {
    $up = Get-NetTCPConnection -State Listen -LocalPort $_ -EA SilentlyContinue
    Write-Host "Port $_ : $(if($up){'UP'}else{'DOWN'})"
}
foreach ($u in @('http://myapps.taskforge.com','http://192.168.1.10','http://127.0.0.1:8000/health')) {
    try {
        $r = Invoke-WebRequest $u -UseBasicParsing -TimeoutSec 15 -MaximumRedirection 0
        Write-Host "OK  $u -> $($r.StatusCode)" -ForegroundColor Green
    } catch { Write-Host "FAIL $u" -ForegroundColor Red }
}

Write-Host "`nRecruiters: run \\192.168.1.10\RecruiterSetup\FIX-MY-PC.bat as Admin on each PC" -ForegroundColor Yellow
