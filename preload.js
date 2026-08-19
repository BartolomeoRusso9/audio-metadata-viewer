const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  analyze: (filePath) => ipcRenderer.invoke('ffprobe:analyze', filePath),
  spectrogram: (filePath) => ipcRenderer.invoke('ffmpeg:spectrogram', filePath),
  saveTags: (filePath, tags) => ipcRenderer.invoke('ffmpeg:saveTags', { filePath, tags }),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  close: () => ipcRenderer.invoke('window:close'),
  platform: process.platform
});
