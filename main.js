const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');

// ffprobe-static / ffmpeg-static ship prebuilt binaries for mac, win and linux,
// so the app works out of the box without requiring the user to install ffmpeg.
let ffprobePath = require('ffprobe-static').path;
let ffmpegPath = require('ffmpeg-static');
// When packaged inside an asar archive, spawned binaries must be unpacked.
ffprobePath = ffprobePath.replace('app.asar', 'app.asar.unpacked');
ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');

// On some setups (npm mirrors, pnpm, copied node_modules, cache restores…)
// the downloaded binaries lose their executable bit or keep a macOS
// "quarantine" flag, which makes execFile fail with EACCES/EPERM even
// though the file is right there. Repairing the permission before every
// call is cheap and fixes the vast majority of "Command failed" reports.
function ensureExecutable(binPath) {
  if (process.platform === 'win32') return;
  try {
    fs.accessSync(binPath, fs.constants.X_OK);
  } catch {
    try {
      fs.chmodSync(binPath, 0o755);
    } catch (e) {
      // Ignore — the error will surface with a clearer message when we
      // actually try to run the binary below.
    }
  }
}

// Wraps execFile with friendlier, actionable error messages instead of the
// raw "Command failed: /path/to/ffprobe ..." dump the user was seeing.
function runTool(binPath, toolLabel, args, options) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(binPath)) {
      reject(new Error(
        `${toolLabel} binary not found at:\n${binPath}\n\n` +
        `Try deleting node_modules and running "npm install" again.`
      ));
      return;
    }
    ensureExecutable(binPath);

    execFile(binPath, args, options, (error, stdout, stderr) => {
      if (error) {
        if (error.code === 'EACCES' || error.code === 'EPERM') {
          reject(new Error(
            `${toolLabel} isn't allowed to run (permission denied) at:\n${binPath}\n\n` +
            (process.platform === 'darwin'
              ? `On macOS this is usually Gatekeeper quarantining the binary. Try running:\n` +
                `xattr -cr "${path.dirname(binPath)}"\n` +
                `then relaunch the app, or reinstall your dependencies.`
              : `Try reinstalling dependencies ("npm install") or checking the file's permissions.`)
          ));
        } else if (error.code === 'ENOENT') {
          reject(new Error(
            `${toolLabel} could not be launched (not found) at:\n${binPath}\n\n` +
            `Reinstall dependencies with "npm install" and try again.`
          ));
        } else {
          reject(new Error(stderr || error.message));
        }
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

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
  const args = [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    '-show_error',
    filePath
  ];
  const { stdout } = await runTool(ffprobePath, 'ffprobe', args, { maxBuffer: 1024 * 1024 * 32 });
  let data;
  try {
    data = JSON.parse(stdout);
  } catch (e) {
    throw new Error('Unable to parse ffprobe output.');
  }
  if (data.error) {
    throw new Error(data.error.string || 'ffprobe returned an error.');
  }
  return { data, filePath };
});

// ---- Spectrogram (ffmpeg showspectrumpic) ----

ipcMain.handle('ffmpeg:spectrogram', async (_event, filePath) => {
  const outPath = path.join(os.tmpdir(), `spectrogram-${crypto.randomBytes(6).toString('hex')}.png`);
  const args = [
    '-y',
    '-i', filePath,
    '-lavfi', 'showspectrumpic=s=1024x512:legend=1:color=intensity',
    '-frames:v', '1',
    outPath
  ];
  try {
    await runTool(ffmpegPath, 'ffmpeg', args, { maxBuffer: 1024 * 1024 * 32 });
    const buffer = fs.readFileSync(outPath);
    return { dataUrl: `data:image/png;base64,${buffer.toString('base64')}` };
  } finally {
    fs.unlink(outPath, () => {});
  }
});

// ---- Metadata editing ----
// Re-muxes the file with updated tags (stream copy, no re-encoding) and
// writes the result to a location the user chooses.

ipcMain.handle('ffmpeg:saveTags', async (_event, { filePath, tags }) => {
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  const defaultPath = path.join(path.dirname(filePath), `${base} (edited)${ext}`);

  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save edited file as…',
    defaultPath,
    filters: [{ name: 'Audio', extensions: [ext.replace('.', '') || '*'] }]
  });
  if (result.canceled || !result.filePath) return { canceled: true };

  const outPath = result.filePath;
  // -map_metadata -1 starts from a clean slate so fields the user removed
  // are actually deleted instead of surviving the copy from the source.
  const args = ['-y', '-i', filePath, '-map', '0', '-map_metadata', '-1', '-c', 'copy'];
  Object.entries(tags || {}).forEach(([key, value]) => {
    args.push('-metadata', `${key}=${value}`);
  });
  args.push(outPath);

  await runTool(ffmpegPath, 'ffmpeg', args, { maxBuffer: 1024 * 1024 * 32 });
  return { canceled: false, outPath };
});

ipcMain.handle('window:minimize', () => mainWindow.minimize());
ipcMain.handle('window:close', () => mainWindow.close());
