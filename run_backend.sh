#!/bin/bash

# Default values
PORT=8000
RELOAD=false
DEBUG=false

# Get script filename automatically
SCRIPT_NAME=$(basename "$0")

# Help
show_help() {
    echo "Runs the backend server."
    echo "Usage: ./$SCRIPT_NAME [options]"
    echo ""
    echo "Options:"
    echo "  -r              Enable auto-reload"
    echo "  -d              Enable debug logging"
    echo "  -p [PORT]       Pick port or 0 for auto (default: 8000)"
    echo "  -help           Show this help message"
    exit 0
}

# Parse command line arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        -r) RELOAD=true; shift ;;
        -d) DEBUG=true; shift ;;
        -p) PORT="$2"; shift 2 ;;
        -help|--help|-h) show_help ;;
        *) echo "Unknown parameter passed: $1"; exit 1 ;;
    esac
done

# Path relative to script
PROJECT_ROOT=$(dirname "$(realpath "$0")")
BACKEND_PATH="$PROJECT_ROOT/backend"

# Base command
UVICORN_ARGS=("app.main:app")

# Reload flag
if [ "$RELOAD" = true ]; then
    UVICORN_ARGS+=("--reload" "--reload-dir" "$BACKEND_PATH")
fi

# Debug flag
if [ "$DEBUG" = true ]; then
    UVICORN_ARGS+=("--log-level" "debug")
fi

# Tell Uvicorn where the app folder is
UVICORN_ARGS+=("--app-dir" "$BACKEND_PATH")

# Set port
UVICORN_ARGS+=("--port" "$PORT")

# Run uvicorn
uvicorn "${UVICORN_ARGS[@]}"