const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

let mainWindow;
const toolWindows = new Map();
const PRELOAD = path.join(__dirname, 'preload.js');
const ICON = path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.icns');

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#f5f5f3',
    icon: ICON,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: false,
      preload: PRELOAD
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'app', 'dashboard', 'index.html'));

  // Intercept new window opens (from tool clicks) → open in new Electron window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // If it's a local tool path, open in a new window
    if (url.includes('file://') || url.startsWith('/') || url.includes('localhost')) {
      openToolWindow(url);
      return { action: 'deny' };
    }
    // External links open in browser
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

function openToolWindow(url) {
  // Convert relative URL to file path
  let filePath = url;
  if (url.startsWith('file://')) {
    filePath = url.replace('file://', '');
  } else if (url.startsWith('../') || url.startsWith('./')) {
    filePath = path.resolve(path.join(__dirname, 'app', 'dashboard'), url);
  }

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 700,
    minHeight: 500,
    backgroundColor: '#f5f5f3',
    icon: ICON,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: PRELOAD
    }
  });

  if (filePath.startsWith('/') || filePath.startsWith('file://')) {
    win.loadFile(filePath.replace('file://', ''));
  } else {
    win.loadURL(url);
  }

  // External links from tools
  win.webContents.setWindowOpenHandler(({ url: u }) => {
    shell.openExternal(u);
    return { action: 'deny' };
  });
}

// ── Menu Bar ──
function createMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about', label: 'About LifeHub' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: 'Quit LifeHub' }
      ]
    },
    {
      label: 'File',
      submenu: [
        { label: 'Home Dashboard', accelerator: 'CmdOrCtrl+H', click: () => { if (mainWindow) mainWindow.loadFile(path.join(__dirname, 'app', 'dashboard', 'index.html')); } },
        { type: 'separator' },
        { label: 'Close Window', accelerator: 'CmdOrCtrl+W', role: 'close' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'toggleDevTools', label: 'Developer Tools' }
      ]
    },
    {
      role: 'window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { role: 'close' },
        { type: 'separator' },
        { role: 'front' }
      ]
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Keyboard Shortcuts',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Shortcuts',
              message: 'LifeHub Shortcuts',
              detail: 'Cmd+H: Home Dashboard\nCmd+W: Close Window\nCmd+R: Reload\nCmd+F: Fullscreen\nCmd++/-: Zoom'
            });
          }
        },
        { type: 'separator' },
        {
          label: 'Check for Updates…',
          click: async () => {
            if (!app.isPackaged) {
              dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'Updates',
                message: 'Auto-update only runs in packaged builds.',
                detail: 'Run from `npm run build-mac` then launch the .app from /dist.'
              });
              return;
            }
            try {
              const result = await autoUpdater.checkForUpdates();
              if (!result || !result.updateInfo) return;
              const cur = app.getVersion();
              if (result.updateInfo.version === cur) {
                dialog.showMessageBox(mainWindow, {
                  type: 'info',
                  title: 'Up to date',
                  message: `LifeHub ${cur} is the latest version.`
                });
              }
            } catch (e) {
              dialog.showMessageBox(mainWindow, {
                type: 'error',
                title: 'Update check failed',
                message: 'Could not reach the update server.',
                detail: String(e?.message || e)
              });
            }
          }
        },
        {
          label: 'Open trylifehub.com',
          click: () => shell.openExternal('https://trylifehub.com')
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── IPC handlers (called from preload via contextBridge) ──
ipcMain.handle('open-external', (_e, url) => shell.openExternal(url));
ipcMain.handle('get-app-version', () => app.getVersion());

// ── Auto-updater ──
// Checks GitHub Releases on launch + every 4h. Prompts user when a new version is ready.
// Requires `publish` config in package.json (set up below) and a published GitHub release.
function setupAutoUpdater() {
  if (!app.isPackaged) return; // Only in production builds
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => console.log('[updater] checking…'));
  autoUpdater.on('update-available', (info) => {
    console.log('[updater] update available:', info.version);
  });
  autoUpdater.on('update-not-available', () => console.log('[updater] up to date'));
  autoUpdater.on('error', (err) => console.error('[updater] error:', err?.message || err));
  autoUpdater.on('download-progress', (p) => {
    console.log(`[updater] download ${Math.round(p.percent)}% @ ${Math.round(p.bytesPerSecond/1024)} KB/s`);
  });
  autoUpdater.on('update-downloaded', (info) => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      buttons: ['Install + restart now', 'Later'],
      defaultId: 0,
      title: 'LifeHub update ready',
      message: `Version ${info.version} is downloaded and ready to install.`,
      detail: 'Click "Install + restart now" to apply the update. Otherwise it will install when you next quit LifeHub.'
    }).then((result) => {
      if (result.response === 0) autoUpdater.quitAndInstall();
    });
  });

  // Initial check + every 4h
  autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  setInterval(() => autoUpdater.checkForUpdatesAndNotify().catch(() => {}), 4 * 60 * 60 * 1000);
}

// ── App Ready ──
app.whenReady().then(() => {
  createMenu();
  createMainWindow();
  setupAutoUpdater();

  // Dock menu
  if (process.platform === 'darwin') {
    const dockMenu = Menu.buildFromTemplate([
      { label: 'Dashboard', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.loadFile(path.join(__dirname, 'app', 'dashboard', 'index.html')); } } },
    ]);
    app.dock.setMenu(dockMenu);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (!mainWindow) createMainWindow();
  else mainWindow.show();
});

app.setName('LifeHub');
