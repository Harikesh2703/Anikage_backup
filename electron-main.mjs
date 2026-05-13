import { app, BrowserWindow, utilityProcess, ipcMain, dialog } from 'electron';
app.name = 'Anikage';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

// Get the path to your server file
const serverPath = app.isPackaged 
  ? path.join(process.resourcesPath, 'app.asar.unpacked/server/index.mjs') 
  : path.join(__dirname, 'server/index.mjs');

// Disable GPU hardware acceleration for better compatibility with Wine and integrated graphics
app.disableHardwareAcceleration();

let mainWindow;
let serverProcess;
let logStream = null;
let userDataPath;
let logPath;
let appDirCrashLog;

const writeLog = (msg) => {
  const timestamp = new Date().toISOString();
  const formatted = `[${timestamp}] ${msg}\n`;
  if (logStream) logStream.write(formatted);
  console.log(formatted.trim());
  
  if (appDirCrashLog) {
    try {
      if (msg.includes('ERROR') || msg.includes('Error') || msg.includes('!!!')) {
        fs.appendFileSync(appDirCrashLog, formatted);
      }
    } catch (e) {}
  }
};

function setupLogging() {
  userDataPath = app.getPath('userData');
  logPath = path.join(userDataPath, 'server.log');
  appDirCrashLog = path.join(path.dirname(process.execPath), 'ANIKAGE_CRASH_REPORT.txt');

  const logDir = path.dirname(logPath);
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  logStream = fs.createWriteStream(logPath, { flags: 'a' });
}

// Kill the backend when the app closes
app.on('will-quit', () => {
  if (serverProcess) serverProcess.kill();
});

function startServer() {
  writeLog('--- APPLICATION STARTUP ---');
  writeLog(`Server Path: ${serverPath}`);
  writeLog(`User Data Path: ${userDataPath}`);

  const nodePath = app.isPackaged 
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules')
    : path.join(__dirname, 'node_modules');

  writeLog(`NODE_PATH: ${nodePath}`);

  try {
    serverProcess = utilityProcess.fork(serverPath, [], {
      env: { 
        ...process.env, 
        PORT: '3001', 
        NODE_ENV: isDev ? 'development' : 'production',
        USER_DATA_PATH: userDataPath,
        NODE_PATH: nodePath
      },
      cwd: app.isPackaged ? path.join(process.resourcesPath, 'app.asar.unpacked') : __dirname,
      stdio: 'pipe'
    });

    serverProcess.stdout.on('data', (data) => writeLog(`[STDOUT] ${data.toString()}`));
    serverProcess.stderr.on('data', (data) => writeLog(`[STDERR] ${data.toString()}`));

    serverProcess.on('spawn', () => writeLog('[Main] Server process successfully spawned.'));
    
    serverProcess.on('exit', (code) => {
      writeLog(`[PROCESS EXIT] Code: ${code}`);
      if (code !== 0) {
        const errorMsg = `FATAL: Server exited with code ${code}. Check ${logPath} for details.`;
        try { fs.appendFileSync(appDirCrashLog, errorMsg); } catch (e) {}
      }
    });
  } catch (err) {
    writeLog(`[SPAWN ERROR] ${err.stack || err.message}`);
    try { fs.appendFileSync(appDirCrashLog, `FAILED TO START SERVER: ${err.stack}\n`); } catch (e) {}
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0c1412',
    title: 'Anikage',
    icon: path.join(__dirname, 'myicon.ico'), 
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    autoHideMenuBar: true
  });

  const startUrl = isDev 
    ? 'http://localhost:8080' 
    : path.join(__dirname, 'frontend/emerald-stream-main/dist/index.html');

  const waitForServer = async (retries = 20) => {
    writeLog('[Main] Probing backend server on port 3001...');
    for (let i = 0; i < retries; i++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1000);
        const response = await fetch('http://localhost:3001/api/ping', { signal: controller.signal });
        clearTimeout(timeoutId);
        if (response.ok) {
          writeLog(`[Main] Backend server ready after ${i + 1} probes.`);
          return true;
        }
      } catch (e) { /* retry */ }
      await new Promise(resolve => setTimeout(resolve, 500)); // Increased frequency
    }
    return false;
  };

  const loadPage = async () => {
    const startTime = Date.now();
    if (isDev) {
      try {
        writeLog('[Main] Waiting for Vite dev server...');
        const { default: waitOn } = await import('wait-on');
        await waitOn({ resources: [startUrl], timeout: 10000 });
        writeLog(`[Main] Vite dev server detected after ${Date.now() - startTime}ms.`);
      } catch (err) {
        writeLog(`[Main] Vite wait-on warning: ${err.message}`);
      }
    }

    const serverStartTime = Date.now();
    const serverReady = await waitForServer();
    if (!serverReady) {
      writeLog('!!! ERROR: Backend server timed out. Opening logs for user.');
      const logPath = path.join(app.getPath('userData'), 'server.log');
      const { shell } = await import('electron');
      shell.openPath(logPath);
    } else {
      writeLog(`[Main] Backend probe took ${Date.now() - serverStartTime}ms.`);
    }

    if (isDev) {
      writeLog(`[Main] Loading URL: ${startUrl}`);
      mainWindow.loadURL(startUrl);
    } else {
      const absoluteDistPath = path.resolve(__dirname, 'frontend/emerald-stream-main/dist/index.html');
      writeLog(`[Main] Loading frontend from: ${absoluteDistPath}`);
      mainWindow.loadFile(absoluteDistPath).catch(err => writeLog(`[LOAD ERROR] ${err.message}`));
    }
    
    writeLog(`[Main] Total frontend load sequence took ${Date.now() - startTime}ms.`);

    // Background Update Check (ONLY after page is loaded)
    mainWindow.webContents.once('did-finish-load', () => {
      writeLog('[Main] Page finished loading. Scheduling update check...');
      setTimeout(() => {
        checkForUpdates(mainWindow);
      }, 5000);
    });
  };

  loadPage();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', () => {
  try {
    setupLogging();
    startServer();
    createWindow();
  } catch (err) {
    console.error(`[Main] Startup Error: ${err.stack || err.message}`);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
// Handle Factory Reset (Wipe everything except database)
ipcMain.handle('factory-reset', async () => {
  try {
    const userDataPath = app.getPath('userData');
    const filesToDelete = [
      path.join(userDataPath, 'patches'),
      path.join(userDataPath, 'server.log'),
      path.join(userDataPath, 'update-config.json'),
      path.join(userDataPath, 'anikage-crash.log')
    ];

    for (const item of filesToDelete) {
      if (fs.existsSync(item)) {
        const stats = fs.statSync(item);
        if (stats.isDirectory()) {
          fs.rmSync(item, { recursive: true, force: true });
        } else {
          fs.unlinkSync(item);
        }
      }
    }

    return { success: true };
  } catch (err) {
    console.error('Factory reset failed:', err.message);
    return { success: false, error: err.message };
  }
});

// Handle Hot-Patching Request
ipcMain.handle('patch-scraper', async (event, { url }) => {
  try {
    const userDataPath = app.getPath('userData');
    const patchesDir = path.join(userDataPath, 'patches');
    const patchPath = path.join(patchesDir, 'allanime.js');

    // Ensure directory exists
    if (!fs.existsSync(patchesDir)) {
      fs.mkdirSync(patchesDir, { recursive: true });
    }

    // Download new scraper
    const response = await fetch(url);
    if (!response.ok) throw new Error('Download failed');
    
    const code = await response.text();
    
    // Safety check: Ensure it's actually JS and contains expected code
    if (!code.includes('class AllAnimeAPI')) {
      throw new Error('Downloaded file appears to be invalid.');
    }

    fs.writeFileSync(patchPath, code);
    return { success: true };
  } catch (err) {
    console.error('Patching failed:', err.message);
    return { success: false, error: err.message };
  }
});

async function checkForUpdates(window) {
  try {
    if (!window) return;
    
    const userDataPath = app.getPath('userData');
    const configPath = path.join(userDataPath, 'update-config.json');
    const now = Date.now();
    const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;

    // Check last update timestamp
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (now - config.lastCheck < ONE_WEEK) {
        console.log('[Update] Last check was less than a week ago. Skipping.');
        return;
      }
    }

    console.log('[Update] Running weekly background update check...');
    // We check a version.json file on your repo
    const response = await fetch('https://raw.githubusercontent.com/Harikesh2703/Anikage_Updates/main/version.json');
    if (!response.ok) return;
    
    const remoteData = await response.json();
    const localVersion = '1.0.0'; 
    
    // Save the new timestamp regardless of whether an update was found
    fs.writeFileSync(configPath, JSON.stringify({ lastCheck: now }));

    if (remoteData.scraper_version > localVersion) {
      window.webContents.send('update-available', {
        version: remoteData.scraper_version,
        changelog: remoteData.changelog,
        url: remoteData.scraper_url
      });
    }
  } catch (err) {
    console.error('Update check failed:', err.message);
  }
}

// Handle Database Export
ipcMain.handle('export-db', async () => {
  try {
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'anikage.db');
    
    if (!fs.existsSync(dbPath)) {
      writeLog(`[Export] Database not found at: ${dbPath}`);
      throw new Error('Database file not found. Have you watched anything yet?');
    }

    let defaultPath;
    try {
      defaultPath = path.join(app.getPath('downloads'), 'anikage_backup.db');
    } catch (e) {
      defaultPath = path.join(app.getPath('home'), 'anikage_backup.db');
    }

    writeLog(`[Export] Opening save dialog. Default path: ${defaultPath}`);

    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Watch History',
      defaultPath: defaultPath,
      filters: [{ name: 'SQLite Database', extensions: ['db'] }]
    });

    if (filePath) {
      fs.copyFileSync(dbPath, filePath);
      writeLog(`[Export] Backup saved to: ${filePath}`);
      return { success: true, path: filePath };
    }
    writeLog('[Export] Dialog cancelled by user.');
    return { success: false, cancelled: true };
  } catch (err) {
    writeLog(`[Export ERROR] ${err.message}`);
    return { success: false, error: err.message };
  }
});

// Handle Database Import
ipcMain.handle('import-db', async () => {
  try {
    writeLog('[Import] Opening open dialog.');
    const { filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Import Watch History',
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
      properties: ['openFile']
    });

    if (filePaths && filePaths.length > 0) {
      const sourcePath = filePaths[0];
      const userDataPath = app.getPath('userData');
      const targetPath = path.join(userDataPath, 'anikage.db');

      writeLog(`[Import] Selected file: ${sourcePath}`);
      writeLog(`[Import] Target path: ${targetPath}`);

      // Kill server process before replacing DB
      if (serverProcess) {
        writeLog('[Import] Killing server process for DB replacement...');
        serverProcess.kill();
      }
      
      // Give it a moment to release the file lock
      await new Promise(resolve => setTimeout(resolve, 800));
      
      fs.copyFileSync(sourcePath, targetPath);
      writeLog('[Import] File copied successfully.');
      
      // RESTART BACKEND: Start the server again with the new database
      writeLog('[Import] Restarting server...');
      startServer();
      
      return { success: true };
    }
    writeLog('[Import] Dialog cancelled by user.');
    return { success: false, cancelled: true };
  } catch (err) {
    writeLog(`[Import ERROR] ${err.message}`);
    return { success: false, error: err.message };
  }
});
