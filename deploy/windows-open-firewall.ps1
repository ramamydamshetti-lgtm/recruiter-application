# Run PowerShell AS ADMINISTRATOR on the server (192.168.1.10).
# Opens inbound TCP 80 (reverse proxy) and 3000 (optional direct Next) for LAN access.

$ErrorActionPreference = 'Stop'
$rules = @(
    @{ Name = 'Recruiter App - HTTP 80 (Caddy)'; Port = 80 },
    @{ Name = 'Recruiter App - HTTPS 443 (Caddy)'; Port = 443 },
    @{ Name = 'Recruiter App - Next 3000'; Port = 3000 },
    @{ Name = 'Recruiter API - Express 8000'; Port = 8000 }
)
foreach ($r in $rules) {
    $existing = Get-NetFirewallRule -DisplayName $r.Name -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host "Firewall rule exists: $($r.Name)"
        continue
    }
    New-NetFirewallRule -DisplayName $r.Name -Direction Inbound -Action Allow -Protocol TCP -LocalPort $r.Port -Profile Private, Domain | Out-Null
    Write-Host "Created: $($r.Name) (TCP $($r.Port))"
}
Write-Host "Done. If other PCs still cannot connect, check router isolation (AP isolation) and that Next uses -H 0.0.0.0 (already in package.json)."
