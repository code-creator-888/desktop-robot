const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_CLEANUP_TARGETS = [
  { id: 'npm-cache', name: 'npm 缓存', path: '~/.npm' },
  { id: 'yarn-cache', name: 'Yarn 缓存', path: '~/Library/Caches/Yarn' },
  { id: 'pnpm-store', name: 'pnpm Store', path: '~/Library/pnpm/store' },
  { id: 'pip-cache', name: 'pip 缓存', path: '~/.cache/pip' },
  { id: 'pip-mac-cache', name: 'pip macOS 缓存', path: '~/Library/Caches/pip' },
  { id: 'cypress-cache', name: 'Cypress 缓存', path: '~/Library/Caches/Cypress' }
];

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return Math.round(bytes) + ' B';
}

function expandHomeDir(inputPath) {
  if (!inputPath.startsWith('~/')) return inputPath;
  return path.join(os.homedir(), inputPath.slice(2));
}

function compactHomeDir(inputPath) {
  const home = os.homedir();
  if (inputPath === home) return '~';
  return inputPath.startsWith(home + path.sep) ? `~${inputPath.slice(home.length)}` : inputPath;
}

function parsePercent(value) {
  const match = String(value || '').match(/(\d+(?:\.\d+)?)%/);
  return match ? Number.parseFloat(match[1]) : 0;
}

function normalizeStartupItemName(name) {
  return String(name || '')
    .trim()
    .slice(0, 160);
}

function toAppleScriptString(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ')}"`;
}

async function getDirectorySize(execFileAsync, absolutePath) {
  if (!fs.existsSync(absolutePath)) return 0;
  try {
    const { stdout } = await execFileAsync('/usr/bin/du', ['-sk', absolutePath], { timeout: 8000 });
    const sizeKb = Number.parseInt(String(stdout).trim().split(/\s+/)[0], 10);
    return Number.isFinite(sizeKb) && sizeKb > 0 ? sizeKb * 1024 : 0;
  } catch {
    return 0;
  }
}

async function getDiskUsage(execFileAsync) {
  try {
    const { stdout } = await execFileAsync('/bin/df', ['-k', os.homedir()], { timeout: 10000 });
    const lines = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const row = lines[lines.length - 1];
    const columns = row.split(/\s+/);
    if (columns.length < 5) throw new Error('invalid df output');

    const totalKb = Number.parseInt(columns[1], 10) || 0;
    const usedKb = Number.parseInt(columns[2], 10) || 0;
    const freeKb = Number.parseInt(columns[3], 10) || 0;
    const usedPercent = Number.parseInt(String(columns[4]).replace('%', ''), 10) || 0;
    const freePercent = totalKb > 0 ? Math.max(0, 100 - usedPercent) : 0;

    return {
      totalBytes: totalKb * 1024,
      usedBytes: usedKb * 1024,
      freeBytes: freeKb * 1024,
      usedPercent,
      freePercent,
      totalLabel: formatBytes(totalKb * 1024),
      usedLabel: formatBytes(usedKb * 1024),
      freeLabel: formatBytes(freeKb * 1024)
    };
  } catch {
    return {
      totalBytes: 0,
      usedBytes: 0,
      freeBytes: 0,
      usedPercent: 0,
      freePercent: 0,
      totalLabel: '-',
      usedLabel: '-',
      freeLabel: '-'
    };
  }
}

async function getLoginItems(execFileAsync) {
  try {
    const { stdout } = await execFileAsync(
      '/usr/bin/osascript',
      ['-e', 'tell application "System Events" to get the name of every login item'],
      { timeout: 10000 }
    );
    return String(stdout)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((name) => ({ name }));
  } catch {
    return [];
  }
}

async function removeLoginItem(execFileAsync, itemName) {
  const normalizedName = normalizeStartupItemName(itemName);
  if (!normalizedName) return { success: false, error: '无效启动项名称' };

  const loginItems = await getLoginItems(execFileAsync);
  if (!loginItems.some((item) => item.name === normalizedName)) {
    return { success: false, error: '未找到该启动项' };
  }

  await execFileAsync(
    '/usr/bin/osascript',
    ['-e', `tell application "System Events" to delete login item ${toAppleScriptString(normalizedName)}`],
    { timeout: 10000 }
  );

  return { success: true, itemName: normalizedName };
}

async function buildCleanupTargets(execFileAsync, targets) {
  return Promise.all(
    targets.map(async (target) => {
      const absolutePath = expandHomeDir(target.path);
      const exists = fs.existsSync(absolutePath);
      const sizeBytes = exists ? await getDirectorySize(execFileAsync, absolutePath) : 0;
      return {
        id: target.id,
        name: target.name,
        path: compactHomeDir(absolutePath),
        exists,
        sizeBytes,
        sizeLabel: formatBytes(sizeBytes),
        canClean: exists && sizeBytes > 0
      };
    })
  );
}

async function clearDirectoryContents(absolutePath) {
  if (!fs.existsSync(absolutePath)) return { removed: 0, failed: 0 };
  const entries = await fs.promises.readdir(absolutePath);
  const results = await Promise.allSettled(
    entries.map((entry) => fs.promises.rm(path.join(absolutePath, entry), { recursive: true, force: false }))
  );
  const failed = results.filter((result) => result.status === 'rejected').length;
  return {
    removed: entries.length - failed,
    failed
  };
}

function buildSuggestions({ systemStats, diskUsage, startupItems, listeningProcesses, cleanupTargets }) {
  const suggestions = [];
  const topCpu = systemStats.topByCpu?.[0];
  const cpuPercent = parsePercent(systemStats.cpu);
  const memPercent = parsePercent(systemStats.memPercent);
  const cleanupBytes = cleanupTargets.reduce((sum, target) => sum + target.sizeBytes, 0);

  if (topCpu && cpuPercent >= 80) {
    suggestions.push({
      level: 'high',
      title: 'CPU 占用偏高',
      detail: `${topCpu.cmd} 当前占用 ${topCpu.cpu}，建议先去系统监控确认是否持续异常。`,
      action: { type: 'open-system-monitor', label: '打开系统监控' }
    });
  }

  if (memPercent >= 85) {
    suggestions.push({
      level: 'high',
      title: '内存压力较大',
      detail: `当前内存占用 ${systemStats.memPercent}，建议关闭不必要的大进程。`,
      action: { type: 'open-system-monitor', label: '查看内存进程' }
    });
  }

  if (diskUsage.freeBytes > 0 && (diskUsage.freePercent <= 15 || diskUsage.freeBytes <= 15 * 1024 * 1024 * 1024)) {
    suggestions.push({
      level: 'high',
      title: '磁盘剩余空间偏低',
      detail: `当前仅剩 ${diskUsage.freeLabel} 可用空间，建议先清理缓存。`,
      action: { type: 'switch-tab', target: 'cleanup', label: '去清理缓存' }
    });
  }

  if (listeningProcesses.length >= 20) {
    suggestions.push({
      level: 'medium',
      title: '后台监听服务较多',
      detail: `当前检测到 ${listeningProcesses.length} 个监听服务，可以检查是否有不用的本地服务常驻。`,
      action: { type: 'open-port-monitor', label: '打开端口监控' }
    });
  }

  if (startupItems.length >= 8) {
    suggestions.push({
      level: 'medium',
      title: '开机启动项偏多',
      detail: `当前有 ${startupItems.length} 个登录项，可能会拖慢开机速度。`,
      action: { type: 'switch-tab', target: 'startup', label: '查看启动项' }
    });
  }

  if (cleanupBytes >= 512 * 1024 * 1024) {
    suggestions.push({
      level: 'medium',
      title: '可清理缓存较多',
      detail: `当前扫描到 ${formatBytes(cleanupBytes)} 开发缓存，可一键清理。`,
      action: { type: 'switch-tab', target: 'cleanup', label: '查看可清理项' }
    });
  }

  if (suggestions.length === 0) {
    suggestions.push({
      level: 'good',
      title: '当前状态良好',
      detail: '暂时没有明显的异常项，这台机器现在还挺健康。',
      action: null
    });
  }

  return suggestions.slice(0, 5);
}

function deriveRiskLevel(suggestions) {
  if (suggestions.some((item) => item.level === 'high')) return '需尽快处理';
  if (suggestions.some((item) => item.level === 'medium')) return '建议关注';
  return '状态良好';
}

function createDesktopCare({
  ipcMain,
  execFileAsync,
  systemMonitor,
  portMonitor,
  cleanupTargets = DEFAULT_CLEANUP_TARGETS
}) {
  const cleanupTargetMap = new Map(cleanupTargets.map((target) => [target.id, target]));

  async function buildSummary() {
    const [systemStats, listeningProcesses, diskUsage, startupItems, scannedCleanupTargets] = await Promise.all([
      systemMonitor.buildSystemStats(),
      portMonitor.scanListeningProcessesFresh(),
      getDiskUsage(execFileAsync),
      getLoginItems(execFileAsync),
      buildCleanupTargets(execFileAsync, cleanupTargets)
    ]);

    const suggestions = buildSuggestions({
      systemStats,
      diskUsage,
      startupItems,
      listeningProcesses,
      cleanupTargets: scannedCleanupTargets
    });
    const cleanupBytes = scannedCleanupTargets.reduce((sum, target) => sum + target.sizeBytes, 0);

    return {
      generatedAt: new Date().toISOString(),
      overview: {
        cpu: systemStats.cpu,
        memPercent: systemStats.memPercent,
        diskFree: diskUsage.freeLabel,
        diskUsedPercent: `${diskUsage.usedPercent}%`,
        listeningServiceCount: listeningProcesses.length,
        startupItemCount: startupItems.length,
        cleanupBytes,
        cleanupLabel: formatBytes(cleanupBytes),
        riskLevel: deriveRiskLevel(suggestions)
      },
      suggestions,
      startupItems,
      cleanupTargets: scannedCleanupTargets
    };
  }

  async function cleanTarget(targetId) {
    const target = cleanupTargetMap.get(String(targetId || ''));
    if (!target) return { success: false, error: '未知清理项' };

    const absolutePath = expandHomeDir(target.path);
    if (!fs.existsSync(absolutePath)) {
      return { success: false, error: '该缓存目录不存在' };
    }

    const beforeBytes = await getDirectorySize(execFileAsync, absolutePath);
    if (beforeBytes <= 0) {
      return { success: false, error: '该缓存目录已经是空的' };
    }

    const cleanupResult = await clearDirectoryContents(absolutePath);
    const afterBytes = await getDirectorySize(execFileAsync, absolutePath);
    const reclaimedBytes = Math.max(0, beforeBytes - afterBytes);

    return {
      success: true,
      removed: cleanupResult.removed,
      failed: cleanupResult.failed,
      reclaimedBytes,
      reclaimedLabel: formatBytes(reclaimedBytes),
      remainingLabel: formatBytes(afterBytes)
    };
  }

  function registerIpc() {
    ipcMain.handle('get-desktop-care-summary', async () => {
      try {
        return await buildSummary();
      } catch (error) {
        return { error: error.message };
      }
    });

    ipcMain.handle('clean-desktop-care-target', async (event, targetId) => {
      try {
        return await cleanTarget(targetId);
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('remove-desktop-care-startup-item', async (event, itemName) => {
      try {
        return await removeLoginItem(execFileAsync, itemName);
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
  }

  return {
    registerIpc,
    buildSummary,
    cleanTarget,
    removeLoginItem
  };
}

module.exports = {
  createDesktopCare,
  DEFAULT_CLEANUP_TARGETS,
  formatBytes,
  buildSuggestions,
  deriveRiskLevel,
  normalizeStartupItemName,
  toAppleScriptString
};
