#!/bin/bash

# Initialize default variables
PORT=8000
HELP=0
SCRIPT_NAME=$(basename "$0")

# Parse command-line arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        -help|--help|-h) HELP=1; shift ;;
        *) echo "Unknown parameter passed: $1"; exit 1 ;;
    esac
done

# Help menu
if [[ "$HELP" == "1" ]]; then
    echo "Runs the frontend client."
    echo "Usage: ./$SCRIPT_NAME [options]"
    echo ""
    echo "Options:"
    echo "  -help           Show this help message"
    exit 0
fi

# Get the directory of the current script
PROJECT_ROOT=$(cd "$(dirname "$0")" && pwd)
FRONTEND_PATH="$PROJECT_ROOT/frontend"

# Run frontend inside a subshell to mimic Push-Location / Pop-Location
(
    # Change directory, and exit the subshell immediately if it fails
    cd "$FRONTEND_PATH" || exit 1 
    
    # Run the npm script
    npm run electron:dev
)