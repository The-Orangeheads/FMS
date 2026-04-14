#!/bin/bash

# Initialize default variables
RELOAD=0
PORT=8000
HELP=0
SCRIPT_NAME=$(basename "$0")

# Parse command-line arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        -r) RELOAD=1; shift ;;
        -help|--help|-h) HELP=1; shift ;;
        *) echo "Unknown parameter passed: $1"; exit 1 ;;
    esac
done

# Help menu
if [[ "$HELP" == "1" ]]; then
    echo "Runs both the frontend and backend."
    echo "Usage: ./$SCRIPT_NAME [options]"
    echo ""
    echo "Options:"
    echo "  -r              Enable auto-reload"
    echo "  -help           Show this help message"
    exit 0
fi

# Get the directory of the current script (equivalent to $PSScriptRoot)
PROJECT_ROOT=$(cd "$(dirname "$0")" && pwd)

# Updated extensions to .sh for the shell environment
FRONTEND_PATH="$PROJECT_ROOT/run_frontend.sh"
BACKEND_PATH="$PROJECT_ROOT/run_backend.sh"

echo "Running Frontend"
# Run the frontend in the background and capture its Process ID (PID)
bash "$FRONTEND_PATH" &
FRONTEND_PID=$!

echo "Running Backend"
# Run the backend in the foreground (blocking)
bash "$BACKEND_PATH"

echo "Waiting for frontend to exit"
# Wait specifically for the backgrounded frontend process to finish
wait $FRONTEND_PID