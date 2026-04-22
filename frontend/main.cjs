const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'src', 'assets', 'logo.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
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

ipcMain.handle('get-file-thumbnail', async (_event, filePath) => {
  try {
    let thumb;
    
    if (process.platform === 'win32' || process.platform === 'darwin') {
      thumb = await nativeImage.createThumbnailFromPath(filePath, { width: 256, height: 256 });
    } else {
      thumb = nativeImage.createFromPath(filePath);
      if (!thumb.isEmpty()) {
        thumb = thumb.resize({ width: 256, height: 256 });
      }
    }

    if (thumb && !thumb.isEmpty()) {
        return thumb.toDataURL();
        }
    } catch (error) {
        // Silently ignore OS-level thumbnail failures. 
        // Files like .txt or unsupported .pdfs will naturally throw here.
        // Returning null allows the React frontend to run its fallback icons/PDF renderer.
    }
    return null;
});

ipcMain.handle('read-file-buffer', async (_event, filePath) => {
  const fs = require('fs').promises;
  try {
    const buffer = await fs.readFile(filePath);
    return buffer; 
  } catch (error) {
    console.error("Failed to read file for PDF preview:", error);
    return null;
  }
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