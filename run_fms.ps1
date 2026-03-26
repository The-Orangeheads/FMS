# Start backend in a hidden background process
$BackendProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c .\venv\Scripts\activate && uvicorn app.main:app --host 127.0.0.1 --port 8000" -WindowStyle Hidden -PassThru

# Silently wait until the backend is actively listening on port 8000
while ($true) {
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient("127.0.0.1", 8000)
        $tcp.Close()
        break
    } catch {
        Start-Sleep -Seconds 1
    }
}

# Launch frontend
Set-Location -Path ".\frontend"
npm run electron:dev

# Step back to the root folder and run the clean port script
Set-Location -Path ".."
.\clean_port.ps1