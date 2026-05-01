const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

// ── v1.3.0: thin shell around https://apps.trylifehub.com/ ────────────
// Loading the live web app means the desktop always has the latest SDK,
// tool code, and cloud sync — and shares localStorage origin with the web
// version, so signing in on either side surfaces the same data instantly.
// The Service Worker on apps.trylifehub.com handles offline caching after
// the first online launch.
const APP_URL = 'https://apps.trylifehub.com/';
const APP_ORIGIN = 'https://apps.trylifehub.com';

let mainWindow;
const PRELOAD = path.join(__dirname, 'preload.js');
const ICON = path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.icns');
const OFFLINE_HTML = `data:text/html;charset=utf-8,${encodeURIComponent(`
<!DOCTYPE html><html><head><meta charset="utf-8"><title>LifeHub</title>
<style>
  body{font-family:'Sora',system-ui,-apple-system,sans-serif;background:#0a0a0b;color:rgba(255,255,255,0.7);
       display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}
  .card{max-width:420px;padding:36px}
  h1{color:#fff;font-size:1.4rem;margin:0 0 12px}
  p{font-size:0.92rem;line-height:1.6;margin:0 0 22px}
  button{background:linear-gradient(135deg,#f59e0b,#dc2626);color:#fff;border:none;
         padding:12px 28px;border-radius:99px;font-weight:700;font-size:0.9rem;cursor:pointer;font-family:inherit}
  .dot{display:inline-block;width:10px;height:10px;background:#f59e0b;border-radius:50%;
       box-shadow:0 0 20px #f59e0b;margin-right:8px;vertical-align:middle}
  .logo{font-weight:800;color:#fff;font-size:1.1rem;letter-spacing:-0.02em;margin-bottom:24px}
</style></head>
<body><div class="card">
  <div class="logo"><span class="dot"></span>LifeHub</div>
  <h1>Can't reach LifeHub right now</h1>
  <p>You'll need an internet connection to sign in for the first time. After that, the app caches everything for offline use.</p>
  <button onclick="location.href='${APP_URL}'">Try again</button>
</div></body></html>`)}`;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0a0a0b',
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

  mainWindow.loadURL(APP_URL);

  // First-load network failure → show branded offline fallback that retries.
  mainWindow.webContents.on('did-fail-load', (_e, errorCode, _errorDescription, validatedURL) => {
    // -3 = aborted (probably a redirect during navigation), -27 = blocked by client (devtools).
    // Only show offline page on real network errors, not user-driven aborts.
    if (errorCode === -3 || errorCode === -27) return;
    if (validatedURL && validatedURL.startsWith(APP_ORIGIN)) {
      mainWindow.loadURL(OFFLINE_HTML);
    }
  });

  // External links (target=_blank or window.open) → open in default browser.
  // Same-origin sub-pages stay inside the Electron window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const u = new URL(url);
      if (u.origin === APP_ORIGIN) {
        // Open in a new Electron window for a cleaner multi-tool flow.
        openToolWindow(url);
        return { action: 'deny' };
      }
    } catch (_) {}
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

function openToolWindow(url) {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 700,
    minHeight: 500,
    backgroundColor: '#0a0a0b',
    icon: ICON,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: PRELOAD
    }
  });
  win.loadURL(url);

  // Same-origin sub-windows: cascade through openToolWindow so multiple
  // tools can be open at once. External links escape to the system browser.
  win.webContents.setWindowOpenHandler(({ url: u }) => {
    try {
      if (new URL(u).origin === APP_ORIGIN) {
        openToolWindow(u);
        return { action: 'deny' };
      }
    } catch (_) {}
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
        { label: 'Home Dashboard', accelerator: 'CmdOrCtrl+H', click: () => { if (mainWindow) mainWindow.loadURL(APP_URL); } },
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
      { label: 'Dashboard', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.loadURL(APP_URL); } } },
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
