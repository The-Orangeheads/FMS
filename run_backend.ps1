param(
    [switch]$r,
    [switch]$d,
    [int]$p,
    [switch]$help
)

# Default port if not specified
if (-not $p) { $p = 8000 }

# Get script filename automatically
$scriptName = $MyInvocation.MyCommand.Name

# Help
if ($help) {
    Write-Output "Runs the backend server."
    Write-Output "Usage: ./$scriptName [options]"
    Write-Output ""
    Write-Output "Options:"
    Write-Output "  -r              Enable auto-reload"
    Write-Output "  -d              Enable debug logging"
    Write-Output "  -p [PORT]       Pick port or 0 for auto (default: 8000)"
    Write-Output "  -help           Show this help message"
    exit
}

# Path relative to script
$projectRoot = $PSScriptRoot
$backendPath = Join-Path $projectRoot "backend"

# Base command
$uvicornArgs = @("main:app")

# Reload flag
if ($r) {
    $uvicornArgs += "--reload"
    $uvicornArgs += "--reload-dir"
    $uvicornArgs += $backendPath
}

# Debug flag
if ($d) { 
    $uvicornArgs += "--log-level"
    $uvicornArgs += "debug"
}

# Tell Uvicorn where the app folder is, instead of changing cwd
$uvicornArgs += "--app-dir"
$uvicornArgs += $backendPath

# Set port
$uvicornArgs += "--port"
$uvicornArgs += $p

# Run uvicorn
Push-Location $backendPath
try {
    uvicorn @uvicornArgs
}
finally {
    Pop-Location
}