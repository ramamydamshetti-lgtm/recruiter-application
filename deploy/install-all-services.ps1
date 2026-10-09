# Installs Caddy + Backend + Frontend as Windows services (auto-start on boot).
# Run PowerShell AS ADMINISTRATOR from the deploy folder.
#
#   .\install-all-services.ps1
#   .\install-all-services.ps1 -Remove

[CmdletBinding()]
param(
    [string]$NssmPath = '',
    [switch]$Remove
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$deployDir = $PSScriptRoot
$backendDir = Join-Path $repoRoot 'backend'
$frontendDir = Join-Path $repoRoot 'Staffing_Recruitment_Frontend'
$logsDir = Join-Path $deployDir 'service-logs'
$toolsDir = Join-Path $deployDir 'tools'
$caddyfile = Join-Path $deployDir 'Caddyfile'
$npmCmd = (Get-Command npm.cmd -ErrorAction Stop).Source
$nodeDir = Split-Path $npmCmd -Parent

New-Item -ItemType Directory -Force -Path $logsDir, $toolsDir | Out-Null

function Get-NssmPath {
    param([string]$Override)
    if ($Override -and (Test-Path $Override)) { return (Resolve-Path $Override).Path }
    $candidates = @(
        (Join-Path $toolsDir 'nssm.exe'),
        'C:\ProgramData\chocolatey\bin\nssm.exe',
        'C:\nssm\nssm.exe',
        'C:\tools\nssm\win64\nssm.exe'
    )
    foreach ($p in $candidates) { if (Test-Path $p) { return $p } }
    return $null
}

function Ensure-Nssm {
    param([string]$Path)
    if (Test-Path $Path) { return $Path }
    Write-Host 'Downloading NSSM 2.24...'
    $zip = Join-Path $env:TEMP 'nssm-2.24.zip'
    $extract = Join-Path $env:TEMP 'nssm-2.24'
    Invoke-WebRequest -Uri 'https://nssm.cc/release/nssm-2.24.zip' -OutFile $zip -UseBasicParsing
    Expand-Archive -Path $zip -DestinationPath $extract -Force
    $exe = Get-ChildItem -Path $extract -Filter 'nssm.exe' -Recurse | Where-Object { $_.FullName -match 'win64' } | Select-Object -First 1
    if (-not $exe) { throw 'Failed to extract nssm.exe' }
    Copy-Item $exe.FullName (Join-Path $toolsDir 'nssm.exe') -Force
    return (Join-Path $toolsDir 'nssm.exe')
}

function Resolve-CaddyExe {
    $candidates = @(
        'C:\ProgramData\chocolatey\lib\caddy\tools\caddy.exe',
        'C:\Program Files\Caddy\caddy.exe'
    )
    foreach ($p in $candidates) { if (Test-Path $p) { return $p } }
    return (Get-Command caddy -ErrorAction Stop).Source
}

function Remove-AppService {
    param([string]$Nssm, [string]$Name)
    $svc = Get-Service -Name $Name -ErrorAction SilentlyContinue
    if (-not $svc) { return }
    if ($svc.Status -eq 'Running') { Stop-Service $Name -Force -ErrorAction SilentlyContinue }
  try { & $Nssm remove $Name confirm 2>&1 | Out-Null } catch {}
    Write-Host "Removed $Name"
}

function Install-AppService {
    param(
        [string]$Nssm,
        [string]$Name,
        [string]$DisplayName,
        [string]$Description,
        [string]$App,
        [string]$AppParameters,
        [string]$AppDirectory,
        [string]$LogDir
    )
    try { & $Nssm remove $Name confirm 2>&1 | Out-Null } catch {}
    & $Nssm install $Name $App
    if ($AppParameters) { & $Nssm set $Name AppParameters $AppParameters }
    & $Nssm set $Name AppDirectory $AppDirectory
    & $Nssm set $Name DisplayName $DisplayName
    & $Nssm set $Name Description $Description
    & $Nssm set $Name Start SERVICE_AUTO_START
    & $Nssm set $Name AppEnvironmentExtra "PATH=$nodeDir"
    & $Nssm set $Name AppStdout (Join-Path $LogDir "$Name.out.log")
    & $Nssm set $Name AppStderr (Join-Path $LogDir "$Name.err.log")
    & $Nssm set $Name AppRotateFiles 1
    & $Nssm set $Name AppRotateOnline 1
    & $Nssm set $Name AppRotateBytes 10485760
    & $Nssm start $Name
    Write-Host "Started $Name"
}

# --- main ---
$nssm = Get-NssmPath -Override $NssmPath
if (-not $nssm) { $nssm = Ensure-Nssm -Path (Join-Path $toolsDir 'nssm.exe') }
Write-Host "NSSM: $nssm"

$services = @(
    'RecruiterApp-Backend',
    'RecruiterApp-Frontend',
    'RecruiterApp-Caddy'
)

if ($Remove) {
    foreach ($s in $services) { Remove-AppService -Nssm $nssm -Name $s }
    exit 0
}

# Stop manual processes so ports are free
foreach ($n in @('node', 'caddy')) {
    Get-Process $n -ErrorAction SilentlyContinue | ForEach-Object {
        Write-Host "Stopping $($n) PID $($_.Id) ..."
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
}
Start-Sleep -Seconds 3

$caddyExe = Resolve-CaddyExe
& $caddyExe validate --config $caddyfile | Out-Null

Install-AppService -Nssm $nssm -Name 'RecruiterApp-Backend' `
    -DisplayName 'Recruiter App - Backend API (:8000)' `
    -Description 'Express API for Recruiter Application' `
    -App (Join-Path $backendDir 'node_modules\.bin\tsx.cmd') -AppParameters 'src/index.ts' -AppDirectory $backendDir -LogDir $logsDir

Start-Sleep -Seconds 8

Install-AppService -Nssm $nssm -Name 'RecruiterApp-Frontend' `
    -DisplayName 'Recruiter App - Frontend (:3000)' `
    -Description 'Next.js frontend for Recruiter Application' `
    -App $npmCmd -AppParameters 'run dev' -AppDirectory $frontendDir -LogDir $logsDir

Start-Sleep -Seconds 10

Install-AppService -Nssm $nssm -Name 'RecruiterApp-Caddy' `
    -DisplayName 'Recruiter App - Caddy (:80)' `
    -Description 'HTTP reverse proxy myapps.taskforge.com -> :3000' `
    -App $caddyExe -AppParameters 'run --config Caddyfile' -AppDirectory $deployDir -LogDir $logsDir

Start-Sleep -Seconds 5

Write-Host ''
Write-Host '=== Service status ===' -ForegroundColor Cyan
Get-Service $services | Format-Table Name, Status, StartType -AutoSize

Write-Host '=== Health check ===' -ForegroundColor Cyan
foreach ($u in @('http://127.0.0.1:8000/health', 'http://127.0.0.1:3000', 'http://myapps.taskforge.com')) {
    try {
        $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 15 -MaximumRedirection 0
        Write-Host "OK  $u -> $($r.StatusCode)" -ForegroundColor Green
    } catch {
        Write-Host "WAIT $u (still starting...)" -ForegroundColor Yellow
    }
}

Write-Host ''
Write-Host 'Recruiter PCs still need hosts/DNS — run FIX-MY-PC.bat on each laptop once.' -ForegroundColor Yellow
Write-Host 'Or set router DHCP Primary DNS to 192.168.1.10' -ForegroundColor Yellow
