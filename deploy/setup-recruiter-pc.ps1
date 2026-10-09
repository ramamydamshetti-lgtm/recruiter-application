# Run on EACH recruiter laptop (PowerShell as Administrator) — one-time setup.
# Fixes "myapps.taskforge.com refused to connect" when DNS/hosts are missing.
$ErrorActionPreference = 'Stop'
$serverIp = '192.168.1.10'
$appUrl = "http://myapps.taskforge.com"

Write-Host "=== Recruiter Application — PC setup ===" -ForegroundColor Cyan

# 1) DNS — use the app server for name resolution (forwards other sites to router)
$adapter = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' -and $_.Name -notmatch 'Loopback|vEthernet \(nat\)' } | Select-Object -First 1
if ($adapter) {
    Set-DnsClientServerAddress -InterfaceIndex $adapter.ifIndex -ServerAddresses ($serverIp, '192.168.1.1', '8.8.8.8')
    Write-Host "[OK] DNS set on $($adapter.Name) -> $serverIp, 192.168.1.1"
} else {
    Write-Host "[WARN] No active network adapter found for DNS."
}

# 2) Hosts file backup (works even if DNS is wrong)
$hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
$entries = @(
    "$serverIp`tmyapps.taskforge.com",
    "$serverIp`twww.myapps.taskforge.com",
    "$serverIp`tmetaforgerecruitment.com",
    "$serverIp`twww.metaforgerecruitment.com"
)
$lines = @(Get-Content $hostsPath -ErrorAction SilentlyContinue)
if (-not $lines) { $lines = @() }
$changed = $false
foreach ($entry in $entries) {
    $hostname = ($entry -split '\s+', 2)[1]
    $pattern = [regex]::Escape($hostname)
    $lines = @($lines | Where-Object { $_ -notmatch "\s$pattern(\s|$)" })
    $lines += $entry
    $changed = $true
}
if ($changed) {
    Set-Content -Path $hostsPath -Value $lines -Encoding ASCII
    Write-Host "[OK] Hosts file updated."
}
ipconfig /flushdns | Out-Null

# 3) Proxy bypass (corporate proxy often blocks internal hostnames)
$proxyKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings'
$bypass = (Get-ItemProperty -Path $proxyKey -Name ProxyOverride -ErrorAction SilentlyContinue).ProxyOverride
$needed = @('myapps.taskforge.com','*.taskforge.com','192.168.1.10','192.168.1.168','<local>')
$newBypass = ($needed + @($bypass -split ';' | Where-Object { $_ })) | Select-Object -Unique
$newBypass = ($newBypass -join ';').Trim(';')
Set-ItemProperty -Path $proxyKey -Name ProxyOverride -Value $newBypass -Type String
Write-Host "[OK] Proxy bypass list updated."

# 4) Connectivity test
Write-Host ""
Write-Host "Testing connection to server..."
$port80 = Test-NetConnection $serverIp -Port 80 -WarningAction SilentlyContinue
$dnsOk = $false
try { $dns = Resolve-DnsName myapps.taskforge.com -ErrorAction Stop; $dnsOk = $true; Write-Host "[OK] DNS: myapps.taskforge.com -> $($dns[0].IPAddress)" } catch { Write-Host "[FAIL] DNS lookup failed: $_" }
if ($port80.TcpTestSucceeded) { Write-Host "[OK] TCP port 80 reachable on $serverIp" } else { Write-Host "[FAIL] Cannot reach $serverIp port 80 — check LAN/Wi-Fi/VPN" -ForegroundColor Red }

try {
    $r = Invoke-WebRequest -Uri $appUrl -UseBasicParsing -TimeoutSec 10 -MaximumRedirection 0
    Write-Host "[OK] App HTTP response: $($r.StatusCode)"
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code -eq 308 -or $code -eq 301 -or $code -eq 302) {
        Write-Host "[OK] App redirects (HTTP $code) — use $appUrl not https://"
    } else {
        Write-Host "[WARN] HTTP test: $(if($code){"HTTP $code"}else{$_.Exception.Message})"
        Write-Host "       Try opening: http://$serverIp"
        $appUrl = "http://$serverIp"
    }
}

Write-Host ""
Write-Host "Opening browser: $appUrl" -ForegroundColor Green
Start-Process $appUrl
Write-Host ""
Write-Host "IMPORTANT: Always use http:// (not https://) unless IT installs the LAN certificate."
Write-Host "Bookmark this URL: $appUrl"
