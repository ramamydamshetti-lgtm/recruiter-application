# Run MetaForge email pipeline from repo root (Recruiter Application).
# Example: .\email-pipeline.ps1 --limit 50 pipeline
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$pyDir = Join-Path $root "Auto_email_extraction_final\Auto_email_extraction_final\Auto_email_extraction"
if (-not (Test-Path $pyDir)) {
    Write-Error "Expected folder not found: $pyDir"
}
$venvPy = Join-Path $pyDir ".venv\Scripts\python.exe"
$python = if (Test-Path $venvPy) { $venvPy } else { "python" }
Push-Location $pyDir
try {
    & $python main.py @args
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
