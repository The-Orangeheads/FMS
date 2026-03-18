param(
    [switch]$all,
    [int]$p = 8000,
    [switch]$help
)

# Get script filename automatically
$scriptName = $MyInvocation.MyCommand.Name

# Help
if ($help) {
    Write-Output "Kills all processes listening (or using with -all) to a specific port"
    Write-Output "Usage: ./$scriptName [options]"
    Write-Output ""
    Write-Output "Options:"
    Write-Output "  -all            Terminate all processes using this port, not just listening"
    Write-Output "  -p [PORT]       Pick port (default: 8000)"
    Write-Output "  -help           Show this help message"
    exit
}

# Decide which connections to target
if ($all) {
    # Kill all connections on the port (any state), suppress errors if none
    $connections = Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue
} else {
    # Kill only listening connections (default), suppress errors if none
    $connections = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
}

# Check if any connections were found
if (-not $connections) {
    Write-Output "No processes found on port $p."
    exit
}

# Stop each process
$connections | ForEach-Object {
    Write-Output "Terminating process ID $($_.OwningProcess) on port $p"
    Stop-Process -Id $_.OwningProcess -Force
}