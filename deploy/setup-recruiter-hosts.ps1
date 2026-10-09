# Run on recruiter laptops (PowerShell as Administrator).
# 1) Maps myapps.taskforge.com → server IP
# 2) Trusts the LAN HTTPS certificate (optional; HTTP also works)

$ErrorActionPreference = 'Stop'
$serverIp = '192.168.1.10'
$hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
$certUrl = "http://${serverIp}/cert/root.crt"
$certPath = "$env:TEMP\caddy-local-root.crt"

# --- hosts file ---
$entries = @(
    "$serverIp`tmyapps.taskforge.com",
    "$serverIp`twww.myapps.taskforge.com"
)
$lines = @(Get-Content $hostsPath -ErrorAction SilentlyContinue)
if (-not $lines) { $lines = @() }

$changed = $false
foreach ($entry in $entries) {
    $hostname = ($entry -split '\s+', 2)[1]
    $pattern = [regex]::Escape($hostname)
    $filtered = $lines | Where-Object { $_ -notmatch "\s$pattern(\s|$)" }
    if ($filtered.Count -ne $lines.Count) { $lines = $filtered; $changed = $true }
    if (-not ($lines -match "\s$pattern(\s|$)")) {
        if ($lines.Count -gt 0 -and $lines[-1].Trim() -ne '') { $lines += '' }
        $lines += "# Recruiter Application"
        $lines += $entry
        $changed = $true
    }
}
if ($changed) {
    Set-Content -Path $hostsPath -Value $lines -Encoding ASCII
    Write-Host "Updated hosts file."
} else {
    Write-Host "Hosts entries already present."
}

ipconfig /flushdns | Out-Null

# --- trust LAN cert (best-effort) ---
$localCert = 'C:\Recruiter Application_Dev\deploy\certs\caddy-local-root.crt'
if (Test-Path $localCert) {
    Import-Certificate -FilePath $localCert -CertStoreLocation Cert:\LocalMachine\Root | Out-Null
    Write-Host "Trusted local HTTPS certificate."
}

Write-Host ""
Write-Host "Open the app in your browser:"
Write-Host "  http://myapps.taskforge.com"
Write-Host "  or  http://$serverIp"
Write-Host ""
Write-Host "If an old https bookmark fails, use http:// above or clear HSTS:"
Write-Host "  Chrome: chrome://net-internals/#hsts  (delete myapps.taskforge.com)"
