#!/bin/bash

# Start backend in the background
./run_backend.sh &

# Trap the exit signal and run the clean_port script to guarantee termination
trap "cd ../ && ./clean_port.sh 2>/dev/null" EXIT INT TERM

# Silently wait until the backend is actively listening on port 8000
while ! curl -s http://127.0.0.1:8000 > /dev/null; do
    sleep 1
done

# Backend is up! Launch frontend
cd frontend
npm run electron:dev