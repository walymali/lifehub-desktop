const { app, BrowserWindow, Menu, Tray, nativeTheme, shell, dialog, globalShortcut, nativeImage } = require('electron');
const path = require('path');

let mainWindow, tray;

// ── Menu Bar (macOS style) ──
function createMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about', label: 'About LifeBoard' },
        { type: 'separator' },
        { label: 'Preferences...', accelerator: 'CmdOrCtrl+,', click: () => mainWindow.webContents.executeJavaScript("switchTab('settings',document.querySelectorAll('.tab-btn')[document.querySelectorAll('.tab-btn').length-1])") },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: 'Quit LifeBoard' }
      ]
    },
    {
      label: 'File',
      submenu: [
        { label: 'New Task', accelerator: 'CmdOrCtrl+N', click: () => mainWindow.webContents.executeJavaScript("switchTab('dashboard',document.querySelectorAll('.tab-btn')[0]);setTimeout(()=>document.getElementById('task-input').focus(),100)") },
        { label: 'New Note', accelerator: 'CmdOrCtrl+Shift+N', click: () => mainWindow.webContents.executeJavaScript("switchTab('dashboard',document.querySelectorAll('.tab-btn')[0]);setTimeout(()=>document.getElementById('note-input').focus(),100)") },
        { type: 'separator' },
        { label: 'Export Data...', accelerator: 'CmdOrCtrl+S', click: () => mainWindow.webContents.executeJavaScript('exportData()') },
        { label: 'Import Data...', accelerator: 'CmdOrCtrl+O', click: () => mainWindow.webContents.executeJavaScript("document.getElementById('import-file').click()") },
        { type: 'separator' },
        { label: 'Print...', accelerator: 'CmdOrCtrl+P', click: () => mainWindow.webContents.print() }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Dashboard', accelerator: 'CmdOrCtrl+1', click: () => mainWindow.webContents.executeJavaScript("switchTab('dashboard',document.querySelectorAll('.tab-btn')[0])") },
        { label: 'Pomodoro', accelerator: 'CmdOrCtrl+2', click: () => mainWindow.webContents.executeJavaScript("switchTab('pomodoro',document.querySelectorAll('.tab-btn')[1])") },
        { label: 'Expenses', accelerator: 'CmdOrCtrl+3', click: () => mainWindow.webContents.executeJavaScript("switchTab('expenses',document.querySelectorAll('.tab-btn')[2])") },
        { label: 'Water', accelerator: 'CmdOrCtrl+4', click: () => mainWindow.webContents.executeJavaScript("switchTab('water',document.querySelectorAll('.tab-btn')[3])") },
        { label: 'Bookmarks', accelerator: 'CmdOrCtrl+5', click: () => mainWindow.webContents.executeJavaScript("switchTab('bookmarks',document.querySelectorAll('.tab-btn')[4])") },
        { label: 'Journal', accelerator: 'CmdOrCtrl+6', click: () => mainWindow.webContents.executeJavaScript("switchTab('journal',document.querySelectorAll('.tab-btn')[5])") },
        { label: 'Passwords', accelerator: 'CmdOrCtrl+7', click: () => mainWindow.webContents.executeJavaScript("switchTab('passwords',document.querySelectorAll('.tab-btn')[6])") },
        { label: 'Report', accelerator: 'CmdOrCtrl+8', click: () => mainWindow.webContents.executeJavaScript("switchTab('report',document.querySelectorAll('.tab-btn')[7])") },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
        { type: 'separator' },
        { role: 'toggleDevTools', label: 'Developer Tools' }
      ]
    },
    {
      label: 'Timer',
      submenu: [
        { label: 'Start/Pause Pomodoro', accelerator: 'CmdOrCtrl+T', click: () => mainWindow.webContents.executeJavaScript('pomoToggle()') },
        { label: 'Reset Timer', accelerator: 'CmdOrCtrl+Shift+T', click: () => mainWindow.webContents.executeJavaScript('pomoReset()') },
        { type: 'separator' },
        { label: '25 min Focus', click: () => mainWindow.webContents.executeJavaScript("pomoSet(25,document.querySelectorAll('.pomo-preset')[0])") },
        { label: '15 min Focus', click: () => mainWindow.webContents.executeJavaScript("pomoSet(15,document.querySelectorAll('.pomo-preset')[1])") },
        { label: '50 min Deep Work', click: () => mainWindow.webContents.executeJavaScript("pomoSet(50,document.querySelectorAll('.pomo-preset')[2])") },
        { label: '5 min Break', click: () => mainWindow.webContents.executeJavaScript("pomoSet(5,document.querySelectorAll('.pomo-preset')[3])") }
      ]
    },
    {
      label: 'Language',
      submenu: [
        { label: 'English', click: () => mainWindow.webContents.executeJavaScript("setLang('en')") },
        { label: 'Arabic (عربي)', click: () => mainWindow.webContents.executeJavaScript("setLang('ar')") }
      ]
    },
    {
      role: 'window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { role: 'close' },
        { type: 'separator' },
        { role: 'front' },
        { type: 'separator' },
        { label: 'Always on Top', accelerator: 'CmdOrCtrl+Shift+A', type: 'checkbox', checked: false, click: (menuItem) => { mainWindow.setAlwaysOnTop(menuItem.checked); } }
      ]
    },
    {
      role: 'help',
      submenu: [
        { label: 'Keyboard Shortcuts', click: () => {
          dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Keyboard Shortcuts',
            message: 'LifeBoard Shortcuts',
            detail: 'Cmd+1-8: Switch tabs\nCmd+N: New task\nCmd+Shift+N: New note\nCmd+T: Start/Pause timer\nCmd+Shift+T: Reset timer\nCmd+S: Export data\nCmd+O: Import data\nCmd+P: Print\nCmd+,: Settings\nCmd+Shift+A: Always on top\nCmd+F: Fullscreen'
          });
        }}
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 850,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#09090b',
    titleBarStyle: 'default',
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'app.html'));

  // Smooth window show
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── App Ready ──
app.whenReady().then(() => {
  createMenu();
  createWindow();

  // macOS dock menu
  if (process.platform === 'darwin') {
    const dockMenu = Menu.buildFromTemplate([
      { label: 'New Task', click: () => mainWindow.webContents.executeJavaScript("switchTab('dashboard',document.querySelectorAll('.tab-btn')[0]);setTimeout(()=>document.getElementById('task-input').focus(),100)") },
      { label: 'Start Pomodoro', click: () => mainWindow.webContents.executeJavaScript('pomoToggle()') },
      { type: 'separator' },
      { label: 'Show LifeBoard', click: () => mainWindow.show() }
    ]);
    app.dock.setMenu(dockMenu);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
  else mainWindow.show();
});

// Set app name
app.setName('LifeBoard');
