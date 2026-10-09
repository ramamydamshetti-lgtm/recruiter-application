# Registers Caddy as a Windows service (auto-start on boot).
# Run PowerShell AS ADMINISTRATOR.
#
# Default paths (this project):
#   Caddyfile: C:\Recruiter Application_Dev\deploy\Caddyfile
#   caddy.exe: C:\ProgramData\chocolatey\lib\caddy\tools\caddy.exe
#
# Usage:
#   .\install-caddy-service.ps1
#   .\install-caddy-service.ps1 -NssmPath 'C:\tools\nssm\nssm.exe'
#   .\install-caddy-service.ps1 -Remove
#
# NSSM (recommended): https://nssm.cc/download — extract nssm.exe (win64) and pass -NssmPath.

[CmdletBinding()]
param(
    [string]$CaddyPath = '',
    [string]$CaddyfilePath = '',
    [string]$NssmPath = '',
    [string]$ServiceName = 'RecruiterApp-Caddy',
    [switch]$Remove,
    [switch]$UseNativeService
)

$ErrorActionPreference = 'Stop'

$deployDir = $PSScriptRoot
if (-not $CaddyfilePath) {
    $CaddyfilePath = Join-Path $deployDir 'Caddyfile'
}
$logsDir = Join-Path $deployDir 'service-logs'
New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

function Resolve-CaddyExecutable {
    param([string]$Override)
    if ($Override -and (Test-Path $Override)) {
        return (Resolve-Path $Override).Path
    }
    $candidates = @(
        'C:\ProgramData\chocolatey\lib\caddy\tools\caddy.exe',
        'C:\Program Files\Caddy\caddy.exe'
    )
    foreach ($path in $candidates) {
        if (Test-Path $path) { return $path }
    }
    $cmd = Get-Command caddy -ErrorAction SilentlyContinue
    if ($cmd -and (Test-Path $cmd.Source)) {
        return $cmd.Source
    }
    throw "caddy.exe not found. Install with: winget install CaddyServer.Caddy"
}

function Resolve-NssmExecutable {
    param([string]$Override)
    if ($Override -and (Test-Path $Override)) {
        return (Resolve-Path $Override).Path
    }
    $candidates = @(
        (Join-Path $deployDir 'tools\nssm.exe'),
        'C:\nssm\nssm.exe',
        'C:\tools\nssm\nssm.exe',
        'C:\Program Files\nssm\nssm.exe',
        'C:\Program Files\nssm\win64\nssm.exe'
    )
    foreach ($path in $candidates) {
        if (Test-Path $path) { return $path }
    }
    $cmd = Get-Command nssm -ErrorAction SilentlyContinue
    if ($cmd -and (Test-Path $cmd.Source)) {
        return $cmd.Source
    }
    return $null
}

function Stop-ManualCaddyProcesses {
    Get-Process caddy -ErrorAction SilentlyContinue | ForEach-Object {
        Write-Host "Stopping manual caddy.exe (PID $($_.Id)) ..."
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
}

function Remove-CaddyService {
    param([string]$Name, [string]$Nssm)
    $existing = Get-Service -Name $Name -ErrorAction SilentlyContinue
    if (-not $existing) {
        Write-Host "Service '$Name' is not installed."
        return
    }
    if ($existing.Status -eq 'Running') {
        Stop-Service -Name $Name -Force
    }
    if ($Nssm) {
        & $Nssm remove $Name confirm
    } else {
        sc.exe delete $Name | Out-Null
    }
    Write-Host "Removed service '$Name'."
}

function Install-CaddyWithNssm {
    param(
        [string]$Name,
        [string]$Nssm,
        [string]$Caddy,
        [string]$Config,
        [string]$WorkDir,
        [string]$LogDir
    )
    & $Nssm remove $Name confirm 2>$null | Out-Null

    & $Nssm install $Name $Caddy
    & $Nssm set $Name AppParameters 'run --config Caddyfile'
    & $Nssm set $Name AppDirectory $WorkDir
    & $Nssm set $Name DisplayName 'Recruiter App - Caddy reverse proxy'
    & $Nssm set $Name Description 'Caddy HTTP/HTTPS reverse proxy for myapps.taskforge.com -> Next.js :3000'
    & $Nssm set $Name Start SERVICE_AUTO_START
    & $Nssm set $Name AppStdout (Join-Path $LogDir 'caddy.out.log')
    & $Nssm set $Name AppStderr (Join-Path $LogDir 'caddy.err.log')
    & $Nssm set $Name AppRotateFiles 1
    & $Nssm set $Name AppRotateOnline 1
    & $Nssm set $Name AppRotateBytes 10485760

    Write-Host "Starting service '$Name' ..."
    & $Nssm start $Name
}

function Install-CaddyWithNewService {
    param(
        [string]$Name,
        [string]$Caddy,
        [string]$Config,
        [string]$WorkDir
    )
    $existing = Get-Service -Name $Name -ErrorAction SilentlyContinue
    if ($existing) {
        if ($existing.Status -eq 'Running') { Stop-Service -Name $Name -Force }
        sc.exe delete $Name | Out-Null
        Start-Sleep -Seconds 2
    }

    # sc.exe requires one binPath= argument; nested quotes for paths with spaces.
    $binPath = "`"$Caddy`" run --config `"$Config`""
    New-Service `
        -Name $Name `
        -BinaryPathName $binPath `
        -DisplayName 'Recruiter App - Caddy reverse proxy' `
        -Description 'Caddy HTTP/HTTPS reverse proxy for myapps.taskforge.com -> Next.js :3000' `
        -StartupType Automatic | Out-Null

    # Native services do not set working directory; registry fix for relative Caddy paths.
    $regPath = "HKLM:\SYSTEM\CurrentControlSet\Services\$Name"
    if (Test-Path $regPath) {
        Set-ItemProperty -Path $regPath -Name 'ImagePath' -Value $binPath
    }

    Write-Host "Starting service '$Name' ..."
    Start-Service -Name $Name
}

# --- main ---
$caddyExe = Resolve-CaddyExecutable -Override $CaddyPath
$caddyfile = (Resolve-Path $CaddyfilePath).Path
$nssmExe = Resolve-NssmExecutable -Override $NssmPath

Write-Host "Caddy:     $caddyExe"
Write-Host "Caddyfile: $caddyfile"
Write-Host "Service:   $ServiceName"

if (-not (Test-Path $caddyfile)) {
    throw "Caddyfile not found: $caddyfile"
}

& $caddyExe validate --config $caddyfile | Out-Null
Write-Host "Caddyfile validation: OK"

if ($Remove) {
    Remove-CaddyService -Name $ServiceName -Nssm $nssmExe
    exit 0
}

Stop-ManualCaddyProcesses

if ($nssmExe -and -not $UseNativeService) {
    Write-Host "NSSM:      $nssmExe"
    Install-CaddyWithNssm `
        -Name $ServiceName `
        -Nssm $nssmExe `
        -Caddy $caddyExe `
        -Config $caddyfile `
        -WorkDir $deployDir `
        -LogDir $logsDir
} else {
    if (-not $UseNativeService) {
        Write-Host ""
        Write-Host "NSSM not found. Falling back to New-Service (less reliable for Caddy)." -ForegroundColor Yellow
        Write-Host "For production, download NSSM from https://nssm.cc/download and re-run with -NssmPath." -ForegroundColor Yellow
        Write-Host ""
    }
    Install-CaddyWithNewService `
        -Name $ServiceName `
        -Caddy $caddyExe `
        -Config $caddyfile `
        -WorkDir $deployDir
}

$svc = Get-Service -Name $ServiceName
Write-Host ""
Write-Host "Installed. Status: $($svc.Status)" -ForegroundColor Green
Write-Host "Logs: $logsDir\caddy.out.log"
Write-Host "Test: http://myapps.taskforge.com  (requires Next.js on :3000)"
