const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'src', 'assets', 'logo.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // Use 127.0.0.1 to avoid Windows localhost IPv6 bugs
  mainWindow.loadURL('http://127.0.0.1:5173');
  
  // Optional: Open DevTools for debugging
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

ipcMain.handle('open-directory-picker', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'], // Restrict to folders only
  });
  if (canceled) {
    return null;
  } else {
    return filePaths[0]; // Return the absolute path
  }
});

ipcMain.handle('open-image-picker', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      {
        name: 'Images',
        extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'],
      },
    ],
  });
  if (canceled) {
    return null;
  } else {
    return filePaths[0];
  }
});

ipcMain.handle('open-file-in-os', async (_event, filePath) => {
  if (!filePath || typeof filePath !== 'string') {
    return { ok: false, error: 'Invalid file path' };
  }
  const error = await shell.openPath(filePath);
  if (error) {
    return { ok: false, error };
  }
  return { ok: true };
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});