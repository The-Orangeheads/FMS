param(
    [switch]$r,
    [switch]$help
)

# Default port if not specified
if (-not $p) { $p = 8000 }

# Get script filename automatically
$scriptName = $MyInvocation.MyCommand.Name

# Help
if ($help) {
    Write-Output "Runs both the frontend and backend."
    Write-Output "Usage: ./$scriptName [options]"
    Write-Output ""
    Write-Output "Options:"
    Write-Output "  -r              Enable auto-reload"
    Write-Output "  -help           Show this help message"
    exit
}

# Path relative to script
$projectRoot = $PSScriptRoot


$frontendPath = Join-Path $projectRoot "run_frontend.ps1"
$backendPath = Join-Path $projectRoot "run_backend.ps1"


Write-Output "Running Frontend"
$frontendProcess = Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$frontendPath`""


Write-Output "Running Backend"
& $backendPath


Write-Output "Waiting for frontend to exit"
$frontendProcess.WaitForExit()