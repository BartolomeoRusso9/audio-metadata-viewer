const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { execFile } = require('child_process');

// ffprobe-static ships a prebuilt ffprobe binary for mac, win and linux,
// so the app works out of the box without requiring the user to install ffmpeg.
let ffprobePath = require('ffprobe-static').path;
// When packaged inside an asar archive, spawned binaries must be unpacked.
ffprobePath = ffprobePath.replace('app.asar', 'app.asar.unpacked');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 700,
    minWidth: 720,
    minHeight: 520,
    backgroundColor: '#1c1c1e',
    titleBarStyle: 'hiddenInset',
    frame: process.platform === 'darwin',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC handlers -----------------------------------------------------

ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select an audio file',
    properties: ['openFile'],
    filters: [
      { name: 'Audio', extensions: ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'opus', 'wma', 'aiff', 'aif', 'alac', 'dsf', 'dff', 'ape', 'wv'] },
      { name: 'All files', extensions: ['*'] }
    ]
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

ipcMain.handle('ffprobe:analyze', async (_event, filePath) => {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      '-show_error',
      filePath
    ];
    execFile(ffprobePath, args, { maxBuffer: 1024 * 1024 * 32 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      try {
        const data = JSON.parse(stdout);
        if (data.error) {
          reject(new Error(data.error.string || 'ffprobe returned an error.'));
          return;
        }
        resolve({ data, filePath });
      } catch (e) {
        reject(new Error('Unable to parse ffprobe output.'));
      }
    });
  });
});

ipcMain.handle('window:minimize', () => mainWindow.minimize());
ipcMain.handle('window:close', () => mainWindow.close());
