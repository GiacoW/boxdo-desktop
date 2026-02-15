const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, Notification, powerMonitor, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

const BASE_URL = 'https://boxdo.com';

let mainWindow;
let tray;
const activeNotifications = new Set();

function createAppMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    // App menu (macOS only)
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' },
          ],
        }]
      : []),
    // Edit
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    // View
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        ...(!app.isPackaged
          ? [{ role: 'toggleDevTools' }]
          : []),
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    // Window
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' },
        ...(isMac
          ? [
              { type: 'separator' },
              { role: 'front' },
            ]
          : []),
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    titleBarStyle: 'default',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Forward web console messages tagged with [REALTIME], [Electron], [SW] to terminal
  mainWindow.webContents.on('console-message', (_, level, message) => {
    if (message.includes('[REALTIME]') || message.includes('[Electron]') || message.includes('[SW]') || message.includes('[NOTIF]')) {
      console.log(`[Web] ${message}`);
    }
  });

  // Clear stale service workers + HTTP cache before loading
  // Without clearCache(), Electron serves old JS bundles after Vercel deploys
  const ses = mainWindow.webContents.session;
  Promise.all([
    ses.clearStorageData({ storages: ['serviceworkers'] }),
    ses.clearCache(),
  ]).then(() => {
    console.log('[Electron] Cleared service workers + HTTP cache');
    mainWindow.loadURL(BASE_URL);
  });

  // Close to tray instead of quit
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const icon = nativeImage.createFromPath(
    path.join(__dirname, 'icon.png')
  ).resize({ width: 16, height: 16 });

  tray = new Tray(icon);
  tray.setToolTip('BoxDo');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open BoxDo', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    mainWindow.show();
    mainWindow.focus();
  });
}

// IPC handlers
ipcMain.handle('set-badge', (_, count) => {
  console.log('[Electron] set-badge:', count);
  app.dock?.setBadge(count > 0 ? count.toString() : '');
});

ipcMain.handle('clear-badge', () => {
  console.log('[Electron] clear-badge');
  app.dock?.setBadge('');
});

ipcMain.handle('get-auto-launch', () => {
  const settings = app.getLoginItemSettings();
  return settings.openAtLogin;
});

ipcMain.handle('set-auto-launch', (_, enabled) => {
  console.log('[Electron] set-auto-launch:', enabled);
  app.setLoginItemSettings({ openAtLogin: enabled });
  return app.getLoginItemSettings().openAtLogin;
});

ipcMain.handle('show-notification', (_, { title, body, url }) => {
  console.log('[Electron] show-notification:', { title, body, url });
  const notif = new Notification({ title, body: body || '' });
  activeNotifications.add(notif);
  notif.on('click', () => {
    mainWindow.show();
    mainWindow.focus();
    if (url) mainWindow.webContents.send('navigate', url);
    activeNotifications.delete(notif);
  });
  notif.on('close', () => {
    activeNotifications.delete(notif);
  });
  notif.show();
});

function setupAutoUpdater() {
  if (!app.isPackaged) {
    console.log('[Electron] Skipping auto-update in dev mode');
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    console.log('[Electron] Update available:', info.version);
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[Electron] Update downloaded:', info.version);
    const response = dialog.showMessageBoxSync(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: `Version ${info.version} has been downloaded.`,
      detail: 'The update will be installed when you restart the app.',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
    });
    if (response === 0) {
      app.isQuitting = true;
      autoUpdater.quitAndInstall();
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('[Electron] Auto-update error:', err.message);
  });

  autoUpdater.checkForUpdatesAndNotify();
}

app.whenReady().then(() => {
  if (app.dock) {
    const iconPath = path.join(__dirname, 'icon.png');
    const dockIcon = nativeImage.createFromPath(iconPath);
    console.log('[Electron] Dock icon loaded, empty?', dockIcon.isEmpty(), 'size:', dockIcon.getSize());
    if (!dockIcon.isEmpty()) {
      app.dock.setIcon(dockIcon);
    }
  }

  // Auto-approve microphone permission for boxdo.com
  const { session } = require('electron');
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const url = webContents.getURL();
    if (url.startsWith('https://boxdo.com') && permission === 'media') {
      callback(true);
      return;
    }
    callback(false);
  });

  createAppMenu();
  createWindow();
  createTray();
  setupAutoUpdater();

  powerMonitor.on('resume', () => {
    console.log('[Electron] System resumed from sleep');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('system-resume');
    }
  });
});

app.on('before-quit', () => { app.isQuitting = true; });
app.on('activate', () => { mainWindow?.show(); });
