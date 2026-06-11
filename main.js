const { app, BrowserWindow, screen, Tray, Menu, ipcMain, nativeImage, clipboard } = require('electron');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const os = require('os');
const fs = require('fs');
const { exec, execFile } = require('child_process');
const util = require('util');
const { dedupeResults, normalizeWebSearchPayload } = require('./lib/web-fallback');
const execAsync = util.promisify(exec);
const execFileAsync = util.promisify(execFile);
const { uIOhook } = require('uiohook-napi');

let translateInProgress = false;
let cmdPressed = false, shiftPressed = false;

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
    await execAsync(`osascript -e 'tell application "System Events" to keystroke "c" using command down'`);
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

let petBounds = null; // { x, y, width, height } in screen coords
let lastMouseX = 0, lastMouseY = 0;

async function buildPetMenuAsync() {
  let modelItems = [];
  let activeId = '';
  if (win) {
    try {
      const raw = await win.webContents.executeJavaScript('localStorage.getItem("modelConfigs")');
      if (raw) {
        const configs = JSON.parse(raw);
        activeId = configs.activeId || '';
        modelItems = (configs.models || []).map(m => ({
          label: m.name + (m.id === activeId ? ' ✓' : ''),
          click: () => win && win.webContents.send('menu-action', 'switch-model:' + m.id)
        }));
      }
    } catch {}
  }

  const items = [
    { label: '💬 聊天', click: () => win && win.webContents.send('menu-action', 'chat') },
  ];

  if (modelItems.length > 0) {
    items.push({ label: '🔄 切换模型', submenu: modelItems });
  }

  items.push(
    { label: '📊 系统监控', click: () => win && win.webContents.send('menu-action', 'system-monitor') },
    { label: '🔌 端口监控', click: () => win && win.webContents.send('menu-action', 'port-monitor') },
    { label: '⏰ 提醒中心', click: () => win && win.webContents.send('menu-action', 'reminder-center') },
    { label: '⚙️ 设置', click: () => win && win.webContents.send('menu-action', 'settings') },
    { type: 'separator' },
    { label: '🚪 退出', click: () => app.quit() }
  );

  return Menu.buildFromTemplate(items);
}

app.whenReady().then(() => {
  createWindow();

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

  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('桌面宠物');

  const trayMenu = Menu.buildFromTemplate([
    { label: '显示宠物', click: () => win && win.show() },
    { label: '退出', click: () => app.quit() }
  ]);
  tray.setContextMenu(trayMenu);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  uIOhook.on('mousemove', (e) => {
    lastMouseX = e.x;
    lastMouseY = e.y;
  });

  uIOhook.on('mousedown', (e) => {
    if (e.button !== 1) return; // uiohook: button 1 = left
    if (!petBounds || !win) return;
    const { x, y, width, height } = petBounds;
    if (e.x >= x && e.x <= x + width && e.y >= y && e.y <= y + height) {
      win.webContents.send('pet-click');
    }
  });

  uIOhook.on('mouseup', async (e) => {
    if (e.button !== 2) return;
    if (!petBounds || !win) return;
    const { x, y, width, height } = petBounds;
    if (e.x >= x && e.x <= x + width && e.y >= y && e.y <= y + height) {
      win.webContents.send('set-ignore-mouse-events', false);
      win.setIgnoreMouseEvents(false);
      const menu = await buildPetMenuAsync();
      menu.popup({ window: win, x: e.x - win.getBounds().x, y: e.y - win.getBounds().y });
    }
  });

  uIOhook.start();
});

ipcMain.on('set-ignore-mouse-events', (event, ignore) => {
  if (win) win.setIgnoreMouseEvents(ignore, ignore ? { forward: true } : undefined);
});

ipcMain.on('set-pet-bounds', (event, bounds) => {
  petBounds = bounds;
});

ipcMain.on('show-context-menu', async (event, { x, y }) => {
  if (!win) return;
  const menu = await buildPetMenuAsync();
  menu.popup({ window: win, x, y });
});

ipcMain.on('quit-app', () => {
  app.quit();
});

ipcMain.handle('chat', async (event, { baseUrl, model, apiKey, messages, provider }) => {
  try {
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
        'x-api-key': apiKey,
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
          'Authorization': `Bearer ${apiKey}`,
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
              }
              const thinkingBlock = json.content?.find?.(c => c.type === 'thinking');
              if (thinkingBlock && thinkingBlock.thinking) {
                resolve(thinkingBlock.thinking);
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

ipcMain.handle('get-env-api-key', () => {
  return process.env.ANTHROPIC_API_KEY || '';
});

ipcMain.handle('get-env-config', () => {
  return {
    baseUrl: process.env.ANTHROPIC_BASE_URL || '',
    model: process.env.ANTHROPIC_DEFAULT_SONNET_MODEL || '',
    apiKey: process.env.ANTHROPIC_API_KEY || ''
  };
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
    const { stdout } = await execAsync(
      "netstat -ibn 2>/dev/null | awk 'NR>1 && $1!~/^lo/ && $1!~/^Name/ && $4!~/^Address/ {ibytes+=$7; obytes+=$10} END {print ibytes, obytes}'",
      { timeout: 10000 }
    );
    const parts = stdout.trim().split(/\s+/);
    return { inBytes: parseInt(parts[0], 10) || 0, outBytes: parseInt(parts[1], 10) || 0 };
  } catch {
    return { inBytes: 0, outBytes: 0 };
  }
}

async function getDiskStats() {
  try {
    const { stdout } = await execAsync(
      "ioreg -c IOBlockStorageDriver -r -k Statistics 2>/dev/null | grep Statistics",
      { timeout: 10000 }
    );
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
    const { stdout } = await execAsync("top -l 2 -n 0 -s 1 | grep 'CPU usage' | tail -1", { timeout: 15000 });
    const match = stdout.match(/(\d+\.?\d*)\s*%\s*user.*?(\d+\.?\d*)\s*%\s*sys/);
    if (match) return (parseFloat(match[1]) + parseFloat(match[2])).toFixed(1) + '%';
    const m2 = stdout.match(/(\d+\.?\d*)\s*%\s*user/);
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
  if (!Number.isInteger(pid) || pid <= 0) {
    return { success: false, error: '无效 PID' };
  }
  try {
    await execAsync(`kill -TERM ${pid} 2>&1`, { timeout: 5000 });
  } catch (e) {
    return { success: false, error: e.message || String(e) };
  }
  // Wait briefly then SIGKILL if still alive
  await new Promise(r => setTimeout(r, 600));
  try {
    process.kill(pid, 0); // throws if process is gone
    await execAsync(`kill -KILL ${pid} 2>&1`, { timeout: 5000 });
  } catch {
    // process already gone, that's fine
  }
  return { success: true };
});

ipcMain.handle('add-port', async (event, port) => {
  try {
    const ports = loadPorts();
    if (ports.includes(port)) return { success: false, error: '端口已存在' };
    ports.push(port);
    ports.sort((a, b) => a - b);
    savePorts(ports);
    return { success: true, ports };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('remove-port', async (event, port) => {
  try {
    const ports = loadPorts().filter(p => p !== port);
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
  uIOhook.stop();
  // Force exit after 3s in case hung child processes block the event loop
  setTimeout(() => app.exit(0), 3000).unref();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
