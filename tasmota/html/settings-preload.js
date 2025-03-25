const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
   onInitTasmota: (callback) => ipcRenderer.on('onInit-tasmota', (_event, value) => callback(value)),
   getMsg: (value) => ipcRenderer.invoke('tasmota-msg', value),
   setConfig: (value) => ipcRenderer.invoke('tasmota-config', value),
   getLocalIPv4: () => ipcRenderer.invoke('tasmota-localIP'),
   quit: () => ipcRenderer.send('tasmota-quit'),
});
