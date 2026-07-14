const fs = require('fs');
const path = require('path');

const DEFAULT_PORTS = [3000, 8080, 3306, 6379];

function createPortMonitor({ app, ipcMain, execFileAsync, getCachedValue, cacheTtlMs = 2000, projectDir = path.join(__dirname, '..') }) {
  const portsFile = path.join(app.getPath('userData'), 'ports.txt');
  const listeningProcessesCache = { value: null, expiresAt: 0, promise: null };

  function migrateLegacyPortsFile() {
    const legacyPath = path.join(projectDir, 'ports.txt');
    if (legacyPath === portsFile || fs.existsSync(portsFile) || !fs.existsSync(legacyPath)) return;
    try {
      fs.mkdirSync(path.dirname(portsFile), { recursive: true });
      fs.copyFileSync(legacyPath, portsFile);
    } catch {}
  }

  function loadPorts() {
    try {
      migrateLegacyPortsFile();
      if (!fs.existsSync(portsFile)) {
        savePorts(DEFAULT_PORTS);
        return [...DEFAULT_PORTS];
      }
      const content = fs.readFileSync(portsFile, 'utf-8');
      const seen = new Set();
      const ports = [];
      for (const line of content.split('\n')) {
        const port = parseInt(line.trim(), 10);
        if (port > 0 && port <= 65535 && !seen.has(port)) {
          seen.add(port);
          ports.push(port);
        }
      }
      return ports.length > 0 ? ports : [...DEFAULT_PORTS];
    } catch {
      return [...DEFAULT_PORTS];
    }
  }

  function savePorts(ports) {
    fs.mkdirSync(path.dirname(portsFile), { recursive: true });
    fs.writeFileSync(portsFile, ports.join('\n') + '\n', 'utf-8');
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
    return getCachedValue(listeningProcessesCache, cacheTtlMs, scanListeningProcessesFresh);
  }

  async function scanListeningProcessesFresh() {
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

  function registerIpc() {
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
      const processes = await scanListeningProcessesFresh();
      if (!processes.some((p) => p.pid === normalizedPid)) {
        return { success: false, error: '该进程未在监听端口中，拒绝终止' };
      }
      try {
        process.kill(normalizedPid, 'SIGTERM');
      } catch (e) {
        return { success: false, error: e.message || String(e) };
      }
      await new Promise(r => setTimeout(r, 600));
      try {
        process.kill(normalizedPid, 0);
        process.kill(normalizedPid, 'SIGKILL');
      } catch {}
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
  }

  return {
    registerIpc,
    loadPorts,
    savePorts,
    normalizePort,
    normalizePid,
    scanListeningProcesses,
    scanListeningProcessesFresh
  };
}

module.exports = {
  createPortMonitor,
  DEFAULT_PORTS
};
