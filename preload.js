const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  setIgnoreMouseEvents: (ignore) => ipcRenderer.send('set-ignore-mouse-events', ignore),
  showContextMenu: (x, y) => ipcRenderer.send('show-context-menu', { x, y }),
  onMenuAction: (callback) => ipcRenderer.on('menu-action', (event, action) => callback(action)),
  quit: () => ipcRenderer.send('quit-app'),
  chat: (config) => ipcRenderer.invoke('chat', config),
  webSearch: (payload) => ipcRenderer.invoke('web-search', payload),
  getHotNews: (count) => ipcRenderer.invoke('get-hot-news', count),
  getEnvApiKey: () => ipcRenderer.invoke('get-env-api-key'),
  getEnvConfig: () => ipcRenderer.invoke('get-env-config'),
  getSystemStats: () => ipcRenderer.invoke('get-system-stats'),
  getPortStats: () => ipcRenderer.invoke('get-port-stats'),
  killProcess: (pid) => ipcRenderer.invoke('kill-process', pid),
  addPort: (port) => ipcRenderer.invoke('add-port', port),
  removePort: (port) => ipcRenderer.invoke('remove-port', port),
  getPortList: () => ipcRenderer.invoke('get-port-list'),
  setRobotBounds: (bounds) => ipcRenderer.send('set-robot-bounds', bounds),
  onTranslateSelection: (cb) => ipcRenderer.on('translate-selection', (_, text) => cb(text)),
  onRobotClick: (cb) => ipcRenderer.on('robot-click', () => cb())
});
