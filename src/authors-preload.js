const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('authors', {
  on: (fn) => ipcRenderer.on('authors', (_e, d) => fn(d)),
  ui: (action, arg) => ipcRenderer.send('authors-ui', action, arg),
});
