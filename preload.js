const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mangho', {
  onFeed: (fn) => ipcRenderer.on('feed', (_e, data) => fn(data)),
  ui: (action, arg) => ipcRenderer.send('ui', action, arg),
  tip: (action, arg) => ipcRenderer.send('tipui', action, arg),
});
