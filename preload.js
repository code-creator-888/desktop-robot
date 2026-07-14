const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  setIgnoreMouseEvents: (ignore) => ipcRenderer.send('set-ignore-mouse-events', ignore),
  onIgnoreMouseEventsChanged: (cb) => ipcRenderer.on('set-ignore-mouse-events', (_, ignore) => cb(ignore)),
  onSyncMouseCapture: (cb) => ipcRenderer.on('sync-mouse-capture', () => cb()),
  showContextMenu: (x, y) => ipcRenderer.send('show-context-menu', { x, y }),
  onMenuAction: (callback) => ipcRenderer.on('menu-action', (event, action) => callback(action)),
  quit: () => ipcRenderer.send('quit-app'),
  chat: (config) => ipcRenderer.invoke('chat', config),
  cancelChat: (requestId) => ipcRenderer.invoke('cancel-chat', requestId),
  webSearch: (payload) => ipcRenderer.invoke('web-search', payload),
  getHotNews: (count) => ipcRenderer.invoke('get-hot-news', count),
  getEnvApiKey: () => ipcRenderer.invoke('get-env-api-key'),
  getEnvConfig: () => ipcRenderer.invoke('get-env-config'),
  protectSecret: (secret) => ipcRenderer.invoke('protect-secret', secret),
  openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url),
  getSystemStats: () => ipcRenderer.invoke('get-system-stats'),
  getPortStats: () => ipcRenderer.invoke('get-port-stats'),
  killProcess: (pid) => ipcRenderer.invoke('kill-process', pid),
  addPort: (port) => ipcRenderer.invoke('add-port', port),
  removePort: (port) => ipcRenderer.invoke('remove-port', port),
  getPortList: () => ipcRenderer.invoke('get-port-list'),
  setRobotBounds: (bounds) => ipcRenderer.send('set-robot-bounds', bounds),
  setModelMenuState: (state) => ipcRenderer.send('set-model-menu-state', state),
  onTranslateSelection: (cb) => ipcRenderer.on('translate-selection', (_, text) => cb(text)),
  onRobotClick: (cb) => ipcRenderer.on('robot-click', () => cb())
});
