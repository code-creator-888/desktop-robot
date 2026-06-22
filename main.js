const { app, BrowserWindow, screen, Tray, Menu, ipcMain, nativeImage, clipboard, safeStorage } = require('electron');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const os = require('os');
const fs = require('fs');
const { execFile } = require('child_process');
const util = require('util');
const { dedupeResults, normalizeWebSearchPayload } = require('./lib/web-fallback');
const execFileAsync = util.promisify(execFile);

let uIOhook = null;
let uIOhookStarted = false;
try {
  ({ uIOhook } = require('uiohook-napi'));
} catch (error) {
  console.warn('[startup] uiohook-napi unavailable; global shortcuts and robot hit-testing are disabled:', error.message);
}

let translateInProgress = false;
let cmdPressed = false, shiftPressed = false;
let modelMenuState = { models: [], activeId: '' };

const PROTECTED_SECRET_PREFIX = 'safe:v1:';
const LEGACY_SECRET_PREFIX = 'plain:v1:';

function isProtectedSecret(value) {
  return typeof value === 'string' && (
    value.startsWith(PROTECTED_SECRET_PREFIX) ||
    value.startsWith(LEGACY_SECRET_PREFIX)
  );
}

function protectSecret(secret) {
  const value = String(secret || '');
  if (!value) return '';
  if (isProtectedSecret(value)) return value;
  if (safeStorage.isEncryptionAvailable()) {
    return PROTECTED_SECRET_PREFIX + safeStorage.encryptString(value).toString('base64');
  }
  return LEGACY_SECRET_PREFIX + Buffer.from(value, 'utf8').toString('base64');
}

function unprotectSecret(secret) {
  const value = String(secret || '');
  if (!value) return '';
  if (value.startsWith(PROTECTED_SECRET_PREFIX)) {
    const encrypted = Buffer.from(value.slice(PROTECTED_SECRET_PREFIX.length), 'base64');
    return safeStorage.decryptString(encrypted);
  }
  if (value.startsWith(LEGACY_SECRET_PREFIX)) {
    return Buffer.from(value.slice(LEGACY_SECRET_PREFIX.length), 'base64').toString('utf8');
  }
  return value;
}

function normalizeModelMenuState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return { models: [], activeId: '' };
  }
  const models = Array.isArray(state.models) ? state.models.slice(0, 30).map((model) => ({
    id: String(model?.id || '').slice(0, 100),
    name: String(model?.name || '').slice(0, 80)
  })).filter(model => model.id && model.name) : [];
  const activeId = String(state.activeId || '');
  return {
    models,
    activeId: models.some(model => model.id === activeId) ? activeId : ''
  };
}

async function handleTranslateShortcut() {
  if (translateInProgress) return;
  translateInProgress = true;
  try {
    // wait for user to release Cmd and Shift before simulating Cmd+C
    await new Promise(resolve => {
      let elapsed = 0;
      const check = setInterval(() => {
        elapsed += 50;
        if (elapsed > 2000) { clearInterval(check); resolve(); }
        if (!cmdPressed && !shiftPressed) { clearInterval(check); resolve(); }
      }, 50);
    });
    await new Promise(r => setTimeout(r, 50));
    const oldClip = clipboard.readText();
    await execFileAsync('/usr/bin/osascript', ['-e', 'tell application "System Events" to keystroke "c" using command down']);
    await new Promise(r => setTimeout(r, 300));
    const selected = clipboard.readText().trim();
    setTimeout(() => clipboard.writeText(oldClip), 500);
    if (win) win.webContents.send('translate-selection', selected);
  } catch (e) {
    console.log('[translate] error:', e.message);
    if (win) win.webContents.send('translate-selection', '');
  } finally {
    setTimeout(() => { translateInProgress = false; }, 500);
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
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.setIgnoreMouseEvents(true, { forward: true });
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile('index.html');
}

let robotBounds = null; // { x, y, width, height } in screen coords
let lastMouseX = 0, lastMouseY = 0;

async function buildRobotMenuAsync() {
  const { models, activeId } = modelMenuState;
  const modelItems = models.map(m => ({
    label: m.name + (m.id === activeId ? ' ✓' : ''),
    click: () => win && win.webContents.send('menu-action', 'switch-model:' + m.id)
  }));

  const items = [
    { label: '💬 聊天', click: () => win && win.webContents.send('menu-action', 'chat') },
  ];

  if (modelItems.length > 0) {
    items.push({ label: '🔄 切换模型', submenu: modelItems });
  }

  items.push(
    { label: '🧪 测试空闲动作', submenu: [
      { label: '😪 测试打哈欠', click: () => win && win.webContents.send('menu-action', 'test-idle-yawn') },
      { label: '🤸 测试伸懒腰', click: () => win && win.webContents.send('menu-action', 'test-idle-stretch') },
      { label: '🙈 测试揉眼睛', click: () => win && win.webContents.send('menu-action', 'test-idle-rub-eyes') }
    ] },
    { type: 'separator' },
    { label: '📊 系统监控', click: () => win && win.webContents.send('menu-action', 'system-monitor') },
    { label: '🔌 端口监控', click: () => win && win.webContents.send('menu-action', 'port-monitor') },
    { label: '⏰ 提醒中心', click: () => win && win.webContents.send('menu-action', 'reminder-center') },
    { label: '⚙️ 设置', click: () => win && win.webContents.send('menu-action', 'settings') },
    { label: '🚪 退出', click: () => app.quit() }
  );

  return Menu.buildFromTemplate(items);
}

app.whenReady().then(() => {
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
      if (!robotBounds || !win) return;
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
        win.webContents.send('set-ignore-mouse-events', false);
        win.setIgnoreMouseEvents(false);
        const menu = await buildRobotMenuAsync();
        menu.popup({ window: win, x: e.x - win.getBounds().x, y: e.y - win.getBounds().y });
      }
    });

    uIOhook.start();
    uIOhookStarted = true;
  }
});

ipcMain.on('set-ignore-mouse-events', (event, ignore) => {
  if (win) win.setIgnoreMouseEvents(ignore, ignore ? { forward: true } : undefined);
});

ipcMain.on('set-robot-bounds', (event, bounds) => {
  robotBounds = bounds;
});

ipcMain.on('show-context-menu', async (event, { x, y }) => {
  if (!win) return;
  const menu = await buildRobotMenuAsync();
  menu.popup({ window: win, x, y });
});

ipcMain.on('quit-app', () => {
  app.quit();
});

ipcMain.on('set-model-menu-state', (_event, state) => {
  modelMenuState = normalizeModelMenuState(state);
});

ipcMain.handle('chat', async (event, { baseUrl, model, apiKey, messages, provider }) => {
  try {
    const resolvedApiKey = unprotectSecret(apiKey);
    if (!resolvedApiKey) return { success: false, error: 'Missing API key' };
    const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
    const isAnthropic = provider === 'anthropic';

    let url, postData, options;

    if (isAnthropic) {
      const systemMsg = messages.find(m => m.role === 'system');
      const userMessages = messages.filter(m => m.role !== 'system');

      const anthropicBase = normalizedBaseUrl.replace(/\/v1\/?$/, '');
      url = new URL(anthropicBase + '/v1/messages');
      const body = {
        model,
        max_tokens: 4096,
        messages: userMessages
      };
      if (systemMsg) {
        body.system = systemMsg.content;
      }
      postData = JSON.stringify(body);

      const headers = {
        'Content-Type': 'application/json',
        'x-api-key': resolvedApiKey,
        'Content-Length': Buffer.byteLength(postData)
      };
      if (anthropicBase.includes('anthropic.com')) {
        headers['anthropic-version'] = '2023-06-01';
      }
      options = { method: 'POST', headers };
    } else {
      url = new URL(normalizedBaseUrl + '/chat/completions');
      postData = JSON.stringify({
        model,
        messages,
        temperature: 0.8,
        max_tokens: 150
      });

      options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resolvedApiKey}`,
          'Content-Length': Buffer.byteLength(postData)
        }
      };
    }

    const client = url.protocol === 'https:' ? https : http;

    const content = await new Promise((resolve, reject) => {
      const req = client.request(url, options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            let errMsg;
            try {
              const json = JSON.parse(data);
              errMsg = json.error?.message || json.error?.msg || json.error?.type || JSON.stringify(json).slice(0, 300);
            } catch {
              errMsg = data.slice(0, 300) || '(empty response)';
            }
            reject(new Error(`HTTP ${res.statusCode}: ${errMsg}`));
            return;
          }

          try {
            const json = JSON.parse(data);

            if (isAnthropic) {
              const textBlock = json.content?.find?.(c => c.type === 'text');
              if (textBlock && textBlock.text) {
                resolve(textBlock.text);
                return;
              }
              const thinkingBlock = json.content?.find?.(c => c.type === 'thinking');
              if (thinkingBlock && thinkingBlock.thinking) {
                resolve(thinkingBlock.thinking);
                return;
              }
              reject(new Error('Unexpected Anthropic response: ' + JSON.stringify(json).slice(0, 200)));
            } else {
              if (json.choices && json.choices[0] && json.choices[0].message) {
                resolve(json.choices[0].message.content);
              } else {
                reject(new Error('Unexpected response: ' + JSON.stringify(json).slice(0, 200)));
              }
            }
          } catch (e) {
            reject(new Error(`Parse error: ${data.slice(0, 200)}`));
          }
        });
      });

      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Request timeout (30s)'));
      });

      req.on('error', (err) => reject(err));
      req.write(postData);
      req.end();
    });

    return { success: true, content };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('web-search', async (event, payload) => {
  const normalizedPayload = normalizeWebSearchPayload(payload);
  if (normalizedPayload.error) {
    return { success: false, error: normalizedPayload.error };
  }
  const { query, topK } = normalizedPayload;

  try {
    const url = new URL('https://duckduckgo.com/html/?q=' + encodeURIComponent(query));
    const html = await new Promise((resolve, reject) => {
      const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
            return;
          }
          reject(new Error(`HTTP ${res.statusCode}`));
        });
      });
      req.setTimeout(12000, () => req.destroy(new Error('Search timeout')));
      req.on('error', reject);
    });

    const blocks = [
      ...html.matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)
    ];
    const raw = blocks.map((m) => ({
      url: m[1].replace(/&amp;/g, '&'),
      title: m[2].replace(/<[^>]+>/g, '').trim(),
      snippet: m[3].replace(/<[^>]+>/g, '').trim()
    }));
    const results = dedupeResults(raw, topK);
    if (results.length === 0) return { success: false, error: 'No search results' };
    return { success: true, results };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-hot-news', async (_event, count = 3) => {
  try {
    const url = new URL('https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc');
    const json = await new Promise((resolve, reject) => {
      const req = https.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });
      });
      req.setTimeout(8000, () => req.destroy(new Error('News timeout')));
      req.on('error', reject);
    });
    const parsed = JSON.parse(json);
    const items = (parsed.data || []).slice(0, Math.min(count, 30));
    if (items.length === 0) return { success: false, error: 'No news items' };
    return { success: true, headlines: items.map(i => i.Title) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-env-api-key', () => {
  return protectSecret(process.env.ANTHROPIC_API_KEY || '');
});

ipcMain.handle('get-env-config', () => {
  return {
    baseUrl: process.env.ANTHROPIC_BASE_URL || '',
    model: process.env.ANTHROPIC_DEFAULT_SONNET_MODEL || '',
    apiKey: protectSecret(process.env.ANTHROPIC_API_KEY || '')
  };
});

ipcMain.handle('protect-secret', (_event, secret) => {
  try {
    return {
      success: true,
      value: protectSecret(secret),
      encrypted: safeStorage.isEncryptionAvailable()
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ─── System Monitor ───────────────────────────────────────────────────────────

let prevNetIn = 0, prevNetOut = 0, prevNetTime = 0;
let prevDiskRead = 0, prevDiskWrite = 0, prevDiskTime = 0;

function formatBytes(bytes) {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return bytes + ' B';
}

function formatRate(bytesPerSec) {
  return formatBytes(Math.max(0, bytesPerSec)) + '/s';
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}天 ${h}小时 ${m}分钟`;
}

async function getTopProcesses() {
  try {
    const { stdout } = await execFileAsync('/bin/ps', ['-axo', 'pid=,pcpu=,pmem=,rss=,comm='], { timeout: 10000 });
    const processes = [];
    for (const line of stdout.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split(/\s+/);
      if (parts.length < 5) continue;
      const pid = parseInt(parts[0], 10);
      const cpu = parseFloat(parts[1]);
      const mem = parseFloat(parts[2]);
      const rssKb = parseInt(parts[3], 10);
      const cmd = parts.slice(4).join(' ');
      if (isNaN(pid) || isNaN(cpu)) continue;
      processes.push({ pid, cpu, mem, rss: rssKb * 1024, cmd: cmd || '(unknown)' });
    }
    return processes;
  } catch {
    return [];
  }
}

async function getNetStats() {
  try {
    const { stdout } = await execFileAsync('/usr/sbin/netstat', ['-ibn'], { timeout: 10000 });
    let inBytes = 0;
    let outBytes = 0;
    for (const line of stdout.split('\n')) {
      const columns = line.trim().split(/\s+/);
      if (columns.length < 10 || columns[0] === 'Name' || columns[0].startsWith('lo') || columns[3] === 'Address') continue;
      inBytes += Number.parseInt(columns[6], 10) || 0;
      outBytes += Number.parseInt(columns[9], 10) || 0;
    }
    return { inBytes, outBytes };
  } catch {
    return { inBytes: 0, outBytes: 0 };
  }
}

async function getDiskStats() {
  try {
    const { stdout } = await execFileAsync('/usr/sbin/ioreg', ['-c', 'IOBlockStorageDriver', '-r', '-k', 'Statistics'], { timeout: 10000 });
    let totalRead = 0, totalWrite = 0;
    for (const m of stdout.matchAll(/"Bytes \(Read\)"=(\d+)/g)) totalRead += parseInt(m[1], 10);
    for (const m of stdout.matchAll(/"Bytes \(Write\)"=(\d+)/g)) totalWrite += parseInt(m[1], 10);
    return { readBytes: totalRead, writeBytes: totalWrite };
  } catch {
    return { readBytes: 0, writeBytes: 0 };
  }
}

async function getCpuUsage(processes) {
  try {
    const { stdout } = await execFileAsync('/usr/bin/top', ['-l', '2', '-n', '0', '-s', '1'], { timeout: 15000 });
    const cpuLine = stdout.split('\n').filter(line => line.includes('CPU usage')).pop() || '';
    const match = cpuLine.match(/(\d+\.?\d*)\s*%\s*user.*?(\d+\.?\d*)\s*%\s*sys/);
    if (match) return (parseFloat(match[1]) + parseFloat(match[2])).toFixed(1) + '%';
    const m2 = cpuLine.match(/(\d+\.?\d*)\s*%\s*user/);
    if (m2) return parseFloat(m2[1]).toFixed(1) + '%';
  } catch {}
  if (processes.length > 0) {
    const total = processes.reduce((s, p) => s + p.cpu, 0);
    return Math.min(total / os.cpus().length, 100).toFixed(1) + '%';
  }
  return '-';
}

ipcMain.handle('get-system-stats', async () => {
  try {
    const [processes, netStats, diskStats] = await Promise.all([
      getTopProcesses(),
      getNetStats(),
      getDiskStats()
    ]);

    const cpuUsage = await getCpuUsage(processes);
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const now = Date.now();

    let netInRate = 0, netOutRate = 0;
    if (prevNetTime > 0) {
      const elapsed = (now - prevNetTime) / 1000;
      if (elapsed > 0) {
        netInRate = Math.max(0, netStats.inBytes - prevNetIn) / elapsed;
        netOutRate = Math.max(0, netStats.outBytes - prevNetOut) / elapsed;
      }
    }
    prevNetIn = netStats.inBytes;
    prevNetOut = netStats.outBytes;
    prevNetTime = now;

    let diskReadRate = 0, diskWriteRate = 0;
    if (prevDiskTime > 0 && diskStats.readBytes > 0) {
      const elapsed = (now - prevDiskTime) / 1000;
      if (elapsed > 0) {
        diskReadRate = Math.max(0, diskStats.readBytes - prevDiskRead) / elapsed;
        diskWriteRate = Math.max(0, diskStats.writeBytes - prevDiskWrite) / elapsed;
      }
    }
    prevDiskRead = diskStats.readBytes;
    prevDiskWrite = diskStats.writeBytes;
    prevDiskTime = now;

    const topByCpu = [...processes]
      .sort((a, b) => b.cpu - a.cpu)
      .slice(0, 15)
      .map(p => ({
        pid: p.pid,
        cmd: p.cmd.split('/').pop() || p.cmd,
        cpu: p.cpu.toFixed(1) + '%',
        mem: formatBytes(p.rss),
        memPercent: p.mem.toFixed(1) + '%'
      }));

    const topByMem = [...processes]
      .sort((a, b) => b.rss - a.rss)
      .slice(0, 15)
      .map(p => ({
        pid: p.pid,
        cmd: p.cmd.split('/').pop() || p.cmd,
        cpu: p.cpu.toFixed(1) + '%',
        mem: formatBytes(p.rss),
        memPercent: p.mem.toFixed(1) + '%'
      }));

    return {
      cpu: cpuUsage,
      cpuModel: os.cpus()[0]?.model || '-',
      cpuCount: os.cpus().length,
      memUsed: formatBytes(usedMem),
      memTotal: formatBytes(totalMem),
      memPercent: ((usedMem / totalMem) * 100).toFixed(1) + '%',
      loadAvg: os.loadavg().map(l => l.toFixed(2)).join('  '),
      uptime: formatUptime(os.uptime()),
      netIn: formatRate(netInRate),
      netOut: formatRate(netOutRate),
      diskRead: formatRate(diskReadRate),
      diskWrite: formatRate(diskWriteRate),
      topByCpu,
      topByMem
    };
  } catch (e) {
    return { error: e.message };
  }
});

// ─── Port Monitor ─────────────────────────────────────────────────────────────

const PORTS_FILE = path.join(__dirname, 'ports.txt');
const DEFAULT_PORTS = [3000, 8080, 3306, 6379];

function loadPorts() {
  try {
    if (!fs.existsSync(PORTS_FILE)) {
      savePorts(DEFAULT_PORTS);
      return [...DEFAULT_PORTS];
    }
    const content = fs.readFileSync(PORTS_FILE, 'utf-8');
    const seen = new Set();
    const ports = [];
    for (const line of content.split('\n')) {
      const p = parseInt(line.trim(), 10);
      if (p > 0 && p <= 65535 && !seen.has(p)) {
        seen.add(p);
        ports.push(p);
      }
    }
    return ports.length > 0 ? ports : [...DEFAULT_PORTS];
  } catch {
    return [...DEFAULT_PORTS];
  }
}

function savePorts(ports) {
  fs.writeFileSync(PORTS_FILE, ports.join('\n') + '\n', 'utf-8');
}

function normalizePort(port) {
  const n = Number(port);
  if (!Number.isInteger(n) || n < 1 || n > 65535) return null;
  return n;
}

function normalizePid(pid) {
  const n = Number(pid);
  if (!Number.isInteger(n) || n <= 0 || n === process.pid) return null;
  return n;
}

async function scanListeningProcesses() {
  try {
    const { stdout } = await execFileAsync('/usr/sbin/lsof', ['-nP', '+c', '0', '-iTCP', '-sTCP:LISTEN'], { timeout: 10000 });
    const processMap = new Map();
    const processes = [];

    for (const line of stdout.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('COMMAND')) continue;

      const columns = trimmed.split(/\s+/).filter(Boolean);
      if (columns.length < 9) continue;

      const listenIdx = columns.indexOf('(LISTEN)');
      if (listenIdx === -1 || listenIdx === 0) continue;

      const endpoint = columns[listenIdx - 1];
      const colonIdx = endpoint.lastIndexOf(':');
      if (colonIdx === -1 || colonIdx + 1 >= endpoint.length) continue;

      const port = parseInt(endpoint.substring(colonIdx + 1), 10);
      if (port <= 0) continue;

      const command = columns[0];
      const pid = parseInt(columns[1], 10);
      const user = columns[2];
      const family = columns[4];

      const key = `${pid}:${port}`;
      if (processMap.has(key)) {
        const existing = processMap.get(key);
        if (family === 'IPv4') existing.ipv4 = true;
        if (family === 'IPv6') existing.ipv6 = true;
      } else {
        const proc = { command, pid, user, port, ipv4: family === 'IPv4', ipv6: family === 'IPv6' };
        processMap.set(key, proc);
        processes.push(proc);
      }
    }

    processes.sort((a, b) => a.port !== b.port ? a.port - b.port : a.command.localeCompare(b.command));
    return processes;
  } catch {
    return [];
  }
}

function addrLabel(proc) {
  if (proc.ipv4 && proc.ipv6) return 'IPv4/IPv6';
  if (proc.ipv6) return 'IPv6';
  if (proc.ipv4) return 'IPv4';
  return 'TCP';
}

ipcMain.handle('get-port-stats', async () => {
  try {
    const ports = loadPorts();
    const allProcesses = await scanListeningProcesses();

    const portMap = {};
    for (const port of ports) portMap[port] = [];
    for (const proc of allProcesses) {
      if (portMap[proc.port] !== undefined) {
        portMap[proc.port].push({
          command: proc.command,
          pid: proc.pid,
          user: proc.user,
          addr: addrLabel(proc)
        });
      }
    }

    return {
      ports,
      portMap,
      allListening: allProcesses.slice(0, 50).map(p => ({
        port: p.port,
        command: p.command,
        pid: p.pid,
        user: p.user,
        addr: addrLabel(p)
      })),
      allCount: allProcesses.length
    };
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('kill-process', async (event, pid) => {
  const normalizedPid = normalizePid(pid);
  if (!normalizedPid) {
    return { success: false, error: '无效 PID' };
  }
  try {
    process.kill(normalizedPid, 'SIGTERM');
  } catch (e) {
    return { success: false, error: e.message || String(e) };
  }
  // Wait briefly then SIGKILL if still alive
  await new Promise(r => setTimeout(r, 600));
  try {
    process.kill(normalizedPid, 0); // throws if process is gone
    process.kill(normalizedPid, 'SIGKILL');
  } catch {
    // process already gone, that's fine
  }
  return { success: true };
});

ipcMain.handle('add-port', async (event, port) => {
  try {
    const normalizedPort = normalizePort(port);
    if (!normalizedPort) return { success: false, error: '无效端口' };
    const ports = loadPorts();
    if (ports.includes(normalizedPort)) return { success: false, error: '端口已存在' };
    ports.push(normalizedPort);
    ports.sort((a, b) => a - b);
    savePorts(ports);
    return { success: true, ports };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('remove-port', async (event, port) => {
  try {
    const normalizedPort = normalizePort(port);
    if (!normalizedPort) return { success: false, error: '无效端口' };
    const ports = loadPorts().filter(p => p !== normalizedPort);
    savePorts(ports);
    return { success: true, ports };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('get-port-list', () => {
  return loadPorts();
});

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
