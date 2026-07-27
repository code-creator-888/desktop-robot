const {
  app,
  BrowserWindow,
  screen,
  Tray,
  Menu,
  ipcMain,
  nativeImage,
  clipboard,
  safeStorage,
  shell
} = require('electron');
const path = require('path');
const { execFile } = require('child_process');
const util = require('util');
const { createSecretStore } = require('./lib/secrets');
const { createChatIpc } = require('./lib/chat-ipc');
const { createPortMonitor } = require('./lib/port-monitor');
const { createSystemMonitor } = require('./lib/system-monitor');
const { createDesktopCare } = require('./lib/desktop-care');
const { createWebSearchIpc } = require('./lib/web-search-ipc');
const execFileAsync = util.promisify(execFile);

let uIOhook = null;
let uIOhookStarted = false;
try {
  ({ uIOhook } = require('uiohook-napi'));
} catch (error) {
  console.warn(
    '[startup] uiohook-napi unavailable; global shortcuts and robot hit-testing are disabled:',
    error.message
  );
}

let translateInProgress = false;
let cmdPressed = false,
  shiftPressed = false;
let modelMenuState = { models: [], activeId: '' };
let win = null;
let tray = null;
const SYSTEM_STATS_CACHE_TTL_MS = 1500;
const LISTENING_PROCESSES_CACHE_TTL_MS = 2000;

const secretStore = createSecretStore(safeStorage);
const { protectSecret, unprotectSecret } = secretStore;
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
}

app.on('second-instance', () => {
  if (win && !win.isDestroyed()) {
    win.show();
    win.focus();
  }
});

function normalizeModelMenuState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return { models: [], activeId: '' };
  }
  const models = Array.isArray(state.models)
    ? state.models
        .slice(0, 30)
        .map((model) => ({
          id: String(model?.id || '').slice(0, 100),
          name: String(model?.name || '').slice(0, 80)
        }))
        .filter((model) => model.id && model.name)
    : [];
  const activeId = String(state.activeId || '');
  return {
    models,
    activeId: models.some((model) => model.id === activeId) ? activeId : ''
  };
}

function normalizeFiniteNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(Math.max(Math.round(n), min), max);
}

function normalizeRobotBounds(bounds) {
  if (!bounds || typeof bounds !== 'object' || Array.isArray(bounds)) return null;
  const displayBounds = screen.getPrimaryDisplay().bounds;
  const width = normalizeFiniteNumber(bounds.width, 1, displayBounds.width);
  const height = normalizeFiniteNumber(bounds.height, 1, displayBounds.height);
  const x = normalizeFiniteNumber(
    bounds.x,
    displayBounds.x - displayBounds.width,
    displayBounds.x + displayBounds.width * 2
  );
  const y = normalizeFiniteNumber(
    bounds.y,
    displayBounds.y - displayBounds.height,
    displayBounds.y + displayBounds.height * 2
  );
  if (x === null || y === null || width === null || height === null) return null;
  return { x, y, width, height };
}

function normalizeContextMenuPoint(point) {
  if (!point || typeof point !== 'object' || Array.isArray(point)) return null;
  if (!win || win.isDestroyed()) return null;
  const bounds = win.getBounds();
  const x = normalizeFiniteNumber(point.x, 0, bounds.width);
  const y = normalizeFiniteNumber(point.y, 0, bounds.height);
  if (x === null || y === null) return null;
  return { x, y };
}

function isTrustedIpcSender(event) {
  return Boolean(win && !win.isDestroyed() && event.sender === win.webContents);
}

function lockDownWebContents(webContents) {
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
  webContents.on('will-redirect', (event) => {
    event.preventDefault();
  });
  webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
  webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
}

async function getCachedValue(cache, ttlMs, producer) {
  const now = Date.now();
  if (cache.value && cache.expiresAt > now) return cache.value;
  if (cache.promise) return cache.promise;
  cache.promise = Promise.resolve()
    .then(producer)
    .then((value) => {
      cache.value = value;
      cache.expiresAt = Date.now() + ttlMs;
      return value;
    })
    .finally(() => {
      cache.promise = null;
    });
  return cache.promise;
}

async function handleTranslateShortcut() {
  if (translateInProgress) return;
  translateInProgress = true;
  try {
    // wait for user to release Cmd and Shift before simulating Cmd+C
    await new Promise((resolve) => {
      let elapsed = 0;
      const check = setInterval(() => {
        elapsed += 50;
        if (elapsed > 2000) {
          clearInterval(check);
          resolve();
        }
        if (!cmdPressed && !shiftPressed) {
          clearInterval(check);
          resolve();
        }
      }, 50);
    });
    await new Promise((r) => setTimeout(r, 50));
    const oldClip = clipboard.readText();
    await execFileAsync('/usr/bin/osascript', [
      '-e',
      'tell application "System Events" to keystroke "c" using command down'
    ]);
    await new Promise((r) => setTimeout(r, 300));
    const selectedRaw = clipboard.readText();
    const selected = selectedRaw.trim();
    setTimeout(() => {
      if (clipboard.readText() === selectedRaw) clipboard.writeText(oldClip);
    }, 500);
    if (win) win.webContents.send('translate-selection', selected);
  } catch (e) {
    console.log('[translate] error:', e.message);
    if (win) win.webContents.send('translate-selection', '');
  } finally {
    setTimeout(() => {
      translateInProgress = false;
    }, 500);
  }
}

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  win = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    resizable: false,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });

  lockDownWebContents(win.webContents);
  win.setIgnoreMouseEvents(true, { forward: true });
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile('index.html');
}

let robotBounds = null; // { x, y, width, height } in screen coords
let lastMouseX = 0,
  lastMouseY = 0;

async function buildRobotMenuAsync() {
  const { models, activeId } = modelMenuState;
  const modelItems = models.map((m) => ({
    label: m.name + (m.id === activeId ? ' ✓' : ''),
    click: () => win && win.webContents.send('menu-action', 'switch-model:' + m.id)
  }));

  const items = [{ label: '💬 聊天', click: () => win && win.webContents.send('menu-action', 'chat') }];

  if (modelItems.length > 0) {
    items.push({ label: '🔄 切换模型', submenu: modelItems });
  }

  items.push(
    {
      label: '🧪 测试空闲动作',
      submenu: [
        { label: '😪 测试打哈欠', click: () => win && win.webContents.send('menu-action', 'test-idle-yawn') },
        { label: '🤸 测试伸懒腰', click: () => win && win.webContents.send('menu-action', 'test-idle-stretch') },
        { label: '🙈 测试揉眼睛', click: () => win && win.webContents.send('menu-action', 'test-idle-rub-eyes') }
      ]
    },
    { type: 'separator' },
    {
      label: '🛡️ 电脑管家',
      submenu: [
        { label: '🛡️ 概览', click: () => win && win.webContents.send('menu-action', 'desktop-care') },
        { label: '📊 系统监控', click: () => win && win.webContents.send('menu-action', 'system-monitor') },
        { label: '🔌 端口监控', click: () => win && win.webContents.send('menu-action', 'port-monitor') }
      ]
    },
    { label: '📰 热点新闻', click: () => win && win.webContents.send('menu-action', 'news-panel') },
    { label: '⏰ 提醒中心', click: () => win && win.webContents.send('menu-action', 'reminder-center') },
    { label: '✅ 待办清单', click: () => win && win.webContents.send('menu-action', 'todo-list') },
    { label: '⚙️ 设置', click: () => win && win.webContents.send('menu-action', 'settings') },
    { label: '🚪 退出', click: () => app.quit() }
  );

  return Menu.buildFromTemplate(items);
}

function popupRobotMenuAtScreenPoint(screenX, screenY) {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('set-ignore-mouse-events', false);
  win.setIgnoreMouseEvents(false);
  // Defer native menu opening until the uiohook mouseup event has fully unwound,
  // otherwise the same release can immediately dismiss the menu on macOS.
  setTimeout(async () => {
    if (!win || win.isDestroyed()) return;
    const menu = await buildRobotMenuAsync();
    if (!win || win.isDestroyed()) return;
    menu.popup({
      window: win,
      x: screenX - win.getBounds().x,
      y: screenY - win.getBounds().y,
      callback: () => {
        if (win && !win.isDestroyed()) win.webContents.send('sync-mouse-capture');
      }
    });
  }, 80);
}

app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return;

  createWindow();

  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('桌面机器人');

  const trayMenu = Menu.buildFromTemplate([
    { label: '显示机器人', click: () => win && win.show() },
    { label: '退出', click: () => app.quit() }
  ]);
  tray.setContextMenu(trayMenu);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  if (uIOhook) {
    // Translate shortcut: Cmd+Shift+T
    uIOhook.on('keydown', (e) => {
      if (e.keycode === 3675) cmdPressed = true;
      if (e.keycode === 42) shiftPressed = true;
      if (e.keycode === 20 && cmdPressed && shiftPressed) {
        handleTranslateShortcut();
      }
    });
    uIOhook.on('keyup', (e) => {
      if (e.keycode === 3675) cmdPressed = false;
      if (e.keycode === 42) shiftPressed = false;
    });

    uIOhook.on('mousemove', (e) => {
      lastMouseX = e.x;
      lastMouseY = e.y;
    });

    uIOhook.on('mousedown', (e) => {
      if (e.button !== 1) return; // uiohook: button 1 = left
      if (!win) return;
      win.webContents.send('global-mouse-down', { x: e.x, y: e.y });
      if (!robotBounds) return;
      const { x, y, width, height } = robotBounds;
      if (e.x >= x && e.x <= x + width && e.y >= y && e.y <= y + height) {
        win.webContents.send('robot-click');
      }
    });

    uIOhook.on('mouseup', async (e) => {
      if (e.button !== 2) return;
      if (!robotBounds || !win) return;
      const { x, y, width, height } = robotBounds;
      if (e.x >= x && e.x <= x + width && e.y >= y && e.y <= y + height) {
        popupRobotMenuAtScreenPoint(e.x, e.y);
      }
    });

    uIOhook.start();
    uIOhookStarted = true;
  }
});

ipcMain.on('set-ignore-mouse-events', (event, ignore) => {
  if (!isTrustedIpcSender(event) || typeof ignore !== 'boolean') return;
  if (win) win.setIgnoreMouseEvents(ignore, ignore ? { forward: true } : undefined);
});

ipcMain.on('set-robot-bounds', (event, bounds) => {
  if (!isTrustedIpcSender(event)) return;
  robotBounds = normalizeRobotBounds(bounds);
});

ipcMain.on('show-context-menu', async (event, point) => {
  if (!isTrustedIpcSender(event)) return;
  if (!win) return;
  const menuPoint = normalizeContextMenuPoint(point);
  if (!menuPoint) return;
  const menu = await buildRobotMenuAsync();
  menu.popup({
    window: win,
    x: menuPoint.x,
    y: menuPoint.y,
    callback: () => {
      if (win && !win.isDestroyed()) win.webContents.send('sync-mouse-capture');
    }
  });
});

ipcMain.on('quit-app', (event) => {
  if (!isTrustedIpcSender(event)) return;
  app.quit();
});

ipcMain.on('set-model-menu-state', (event, state) => {
  if (!isTrustedIpcSender(event)) return;
  modelMenuState = normalizeModelMenuState(state);
});

const chatIpc = createChatIpc({ ipcMain, unprotectSecret });
chatIpc.registerIpc();

const webSearchIpc = createWebSearchIpc({ ipcMain, shell });
webSearchIpc.registerIpc();

ipcMain.handle('get-env-api-key', (event) => {
  if (!isTrustedIpcSender(event)) return '';
  return protectSecret(process.env.ANTHROPIC_API_KEY || '');
});

ipcMain.handle('get-env-config', (event) => {
  if (!isTrustedIpcSender(event)) return { baseUrl: '', model: '', apiKey: '' };
  return {
    baseUrl: process.env.ANTHROPIC_BASE_URL || '',
    model: process.env.ANTHROPIC_DEFAULT_SONNET_MODEL || '',
    apiKey: protectSecret(process.env.ANTHROPIC_API_KEY || '')
  };
});

ipcMain.handle('protect-secret', (event, secret) => {
  if (!isTrustedIpcSender(event)) return { success: false, error: 'Untrusted IPC sender' };
  try {
    return {
      success: true,
      value: protectSecret(secret),
      encrypted: secretStore.isEncryptionAvailable()
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ─── System Monitor ───────────────────────────────────────────────────────────

const systemMonitor = createSystemMonitor({
  ipcMain,
  execFileAsync,
  getCachedValue,
  cacheTtlMs: SYSTEM_STATS_CACHE_TTL_MS
});
systemMonitor.registerIpc();

// ─── Port Monitor ─────────────────────────────────────────────────────────────

const portMonitor = createPortMonitor({
  app,
  ipcMain,
  execFileAsync,
  getCachedValue,
  cacheTtlMs: LISTENING_PROCESSES_CACHE_TTL_MS,
  projectDir: __dirname
});
portMonitor.registerIpc();

const desktopCare = createDesktopCare({
  ipcMain,
  execFileAsync,
  systemMonitor,
  portMonitor
});
desktopCare.registerIpc();

app.on('before-quit', () => {
  if (uIOhook && uIOhookStarted) {
    uIOhook.stop();
  }
  // Force exit after 3s in case hung child processes block the event loop
  setTimeout(() => app.exit(0), 3000).unref();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
