# Run from: deploy folder, preferably PowerShell AS ADMINISTRATOR (port 80 needs it on Windows).
# Prerequisites: Caddy installed — winget install CaddyServer.Caddy
# Or: https://caddyserver.com/docs/install#windows

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

$caddy = Get-Command caddy -ErrorAction SilentlyContinue
if (-not $caddy) {
    Write-Host "Caddy not found. Install with:"
    Write-Host "  winget install CaddyServer.Caddy --accept-source-agreements"
    Write-Host "Then reopen PowerShell and run this script again."
    exit 1
}

Write-Host "Starting Caddy (port 80 -> Next on 127.0.0.1:3000). Keep Next running in another window."
Write-Host "Config: $here\Caddyfile"
& caddy run --config "$here\Caddyfile"
