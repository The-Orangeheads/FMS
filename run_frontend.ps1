param(
    [switch]$help
)

# Default port if not specified
if (-not $p) { $p = 8000 }

# Get script filename automatically
$scriptName = $MyInvocation.MyCommand.Name

# Help
if ($help) {
    Write-Output "Runs the frontend client."
    Write-Output "Usage: ./$scriptName [options]"
    Write-Output ""
    Write-Output "Options:"
    Write-Output "  -help           Show this help message"
    exit
}

# Path relative to script
$projectRoot = $PSScriptRoot
$frontendPath = Join-Path $projectRoot "frontend"


# Run frontend
Push-Location $frontendPath
try {
    npm run electron:dev
}
finally {
    Pop-Location
}