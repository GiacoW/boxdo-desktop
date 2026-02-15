const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  setBadge: (count) => ipcRenderer.invoke('set-badge', count),
  clearBadge: () => ipcRenderer.invoke('clear-badge'),
  showNotification: ({ title, body, url }) =>
    ipcRenderer.invoke('show-notification', { title, body, url }),
  getAutoLaunch: () => ipcRenderer.invoke('get-auto-launch'),
  setAutoLaunch: (enabled) => ipcRenderer.invoke('set-auto-launch', enabled),
  onResume: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('system-resume', handler);
    return () => ipcRenderer.removeListener('system-resume', handler);
  },
});

// Listen for navigation from main process (notification click)
ipcRenderer.on('navigate', (_, url) => {
  window.location.href = url;
});
