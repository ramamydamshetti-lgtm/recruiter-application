# Read-only check — does not stop or start anything.
Write-Host "Checking live API on port 8000 ..."
try {
  $r = Invoke-WebRequest -Uri "http://localhost:8000/health" -UseBasicParsing -TimeoutSec 5
  Write-Host "Live OK: $($r.StatusCode) $($r.Content)"
} catch {
  Write-Host "Live not responding on :8000 — start from C:\Recruiter Application\backend if users need the app."
}

Write-Host ""
Write-Host "Checking dev API on port 8080 ..."
try {
  $r = Invoke-WebRequest -Uri "http://localhost:8080/health" -UseBasicParsing -TimeoutSec 5
  Write-Host "Dev OK: $($r.StatusCode) $($r.Content)"
} catch {
  Write-Host "Dev not running (normal if you only started live)."
}
