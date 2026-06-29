const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    invoke: (channel, ...args) => {
      // Safelist of allowed channels
      const validChannels = [
        'open-directory-picker', 
        'open-image-picker', 
        'open-file-in-os',
        'get-file-thumbnail',
        'read-file-buffer',
        'delete-files'
      ];
      
      if (validChannels.includes(channel)) {
        return ipcRenderer.invoke(channel, ...args);
      }
      return Promise.reject(new Error(`Unauthorized IPC channel: ${channel}`));
    }
  }
});