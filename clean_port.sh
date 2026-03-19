#!/bin/bash

# Default values
ALL_CONNS=false
PORT=8000

# Get script filename automatically
SCRIPT_NAME=$(basename "$0")

# Help
show_help() {
    echo "Kills all processes listening (or using with -all) to a specific port"
    echo "Usage: ./$SCRIPT_NAME [options]"
    echo ""
    echo "Options:"
    echo "  -all            Terminate all processes using this port, not just listening"
    echo "  -p [PORT]       Pick port (default: 8000)"
    echo "  -help           Show this help message"
    exit 0
}

# Parse command line arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        -all) ALL_CONNS=true; shift ;;
        -p) PORT="$2"; shift 2 ;;
        -help|--help|-h) show_help ;;
        *) echo "Unknown parameter passed: $1"; exit 1 ;;
    esac
done

# Decide which connections to target using lsof (-t returns only PIDs)
if [ "$ALL_CONNS" = true ]; then
    # All connections on the port (any state), suppress errors if none
    PIDS=$(lsof -t -i TCP:$PORT 2>/dev/null)
else
    # Only listening connections (default), suppress errors if none
    PIDS=$(lsof -t -i TCP:$PORT -s TCP:LISTEN 2>/dev/null)
fi

# Check if any connections were found
if [ -z "$PIDS" ]; then
    echo "No processes found on port $PORT."
    exit 0
fi

# Deduplicate PIDs (lsof sometimes lists a PID multiple times for different threads)
UNIQUE_PIDS=($(echo "$PIDS" | tr ' ' '\n' | sort -u))

# Stop each process
for PID in "${UNIQUE_PIDS[@]}"; do
    echo "Terminating process ID $PID on port $PORT"
    kill -9 "$PID" 2>/dev/null
done