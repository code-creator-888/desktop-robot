const os = require('os');

function createSystemMonitor({ ipcMain, execFileAsync, getCachedValue, cacheTtlMs = 1500 }) {
  const systemStatsCache = { value: null, expiresAt: 0, promise: null };
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
      for (const match of stdout.matchAll(/"Bytes \(Read\)"=(\d+)/g)) totalRead += parseInt(match[1], 10);
      for (const match of stdout.matchAll(/"Bytes \(Write\)"=(\d+)/g)) totalWrite += parseInt(match[1], 10);
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
      const total = processes.reduce((sum, processInfo) => sum + processInfo.cpu, 0);
      return Math.min(total / os.cpus().length, 100).toFixed(1) + '%';
    }
    return '-';
  }

  async function buildSystemStats() {
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
      .map(processInfo => ({
        pid: processInfo.pid,
        cmd: processInfo.cmd.split('/').pop() || processInfo.cmd,
        cpu: processInfo.cpu.toFixed(1) + '%',
        mem: formatBytes(processInfo.rss),
        memPercent: processInfo.mem.toFixed(1) + '%'
      }));

    const topByMem = [...processes]
      .sort((a, b) => b.rss - a.rss)
      .slice(0, 15)
      .map(processInfo => ({
        pid: processInfo.pid,
        cmd: processInfo.cmd.split('/').pop() || processInfo.cmd,
        cpu: processInfo.cpu.toFixed(1) + '%',
        mem: formatBytes(processInfo.rss),
        memPercent: processInfo.mem.toFixed(1) + '%'
      }));

    return {
      cpu: cpuUsage,
      cpuModel: os.cpus()[0]?.model || '-',
      cpuCount: os.cpus().length,
      memUsed: formatBytes(usedMem),
      memTotal: formatBytes(totalMem),
      memPercent: ((usedMem / totalMem) * 100).toFixed(1) + '%',
      loadAvg: os.loadavg().map(load => load.toFixed(2)).join('  '),
      uptime: formatUptime(os.uptime()),
      netIn: formatRate(netInRate),
      netOut: formatRate(netOutRate),
      diskRead: formatRate(diskReadRate),
      diskWrite: formatRate(diskWriteRate),
      topByCpu,
      topByMem
    };
  }

  function registerIpc() {
    ipcMain.handle('get-system-stats', async () => {
      try {
        return await getCachedValue(systemStatsCache, cacheTtlMs, buildSystemStats);
      } catch (error) {
        return { error: error.message };
      }
    });
  }

  return {
    registerIpc,
    buildSystemStats,
    getTopProcesses,
    getNetStats,
    getDiskStats,
    getCpuUsage
  };
}

module.exports = {
  createSystemMonitor
};
