const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const htmlPath = path.join(root, 'index.html');
const cssPath = path.join(root, 'style.css');
const rendererPath = path.join(root, 'renderer.js');
const rendererModulePath = path.join(root, 'renderer-desktop-care.js');
const preloadPath = path.join(root, 'preload.js');
const mainPath = path.join(root, 'main.js');
const modulePath = path.join(root, 'lib', 'desktop-care.js');
const packagePath = path.join(root, 'package.json');

test('desktop care panel exists with overview cleanup and startup sections', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.match(html, /id="desktop-care"/);
  assert.match(html, /id="desktop-care-refresh"/);
  assert.match(html, /id="desktop-care-suggestions"/);
  assert.match(html, /id="desktop-care-cleanup-list"/);
  assert.match(html, /id="desktop-care-startup-list"/);
  assert.match(html, /data-tab="overview"/);
  assert.match(html, /data-tab="cleanup"/);
  assert.match(html, /data-tab="startup"/);
});

test('desktop care panel reuses monitor-card modal structure', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const blockMatch = html.match(/<div id="desktop-care"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
  assert.ok(blockMatch, 'desktop-care block not found');
  assert.match(blockMatch[0], /class="monitor-backdrop"/);
  assert.match(blockMatch[0], /class="monitor-card/);
  assert.match(blockMatch[0], /class="monitor-header"/);
});

test('desktop care styles include hidden state, stat cards, and action rows', () => {
  const css = fs.readFileSync(cssPath, 'utf8');
  assert.match(css, /#desktop-care\b/);
  assert.match(css, /#desktop-care\.hidden/);
  assert.match(css, /\.desktop-care-stats\b/);
  assert.match(css, /\.desktop-care-item\b/);
  assert.match(css, /\.desktop-care-clean-btn\b/);
});

test('desktop care renderer module exposes controller factory and cleanup action', () => {
  const source = fs.readFileSync(rendererModulePath, 'utf8');
  assert.match(source, /window\.RobotDesktopCare\s*=\s*\{/);
  assert.match(source, /createDesktopCareController/);
  assert.match(source, /window\.electronAPI\.getDesktopCareSummary\(\)/);
  assert.match(source, /window\.electronAPI\.cleanDesktopCareTarget/);
  assert.match(source, /window\.electronAPI\.removeDesktopCareStartupItem/);
  assert.match(source, /function setLoadingState\(\)/);
  assert.match(source, /result\.failed > 0/);
});

test('renderer wires desktop care menu action and event binding', () => {
  const source = fs.readFileSync(rendererPath, 'utf8');
  assert.match(source, /action === 'desktop-care'/);
  assert.match(source, /desktopCareController\.bindDesktopCareEvents\(\)/);
  assert.match(source, /isDesktopCareOpen/);
});

test('preload exposes desktop care IPC bridge methods', () => {
  const source = fs.readFileSync(preloadPath, 'utf8');
  assert.match(source, /getDesktopCareSummary:\s*\(\) => ipcRenderer\.invoke\('get-desktop-care-summary'\)/);
  assert.match(
    source,
    /cleanDesktopCareTarget:\s*\(targetId\) => ipcRenderer\.invoke\('clean-desktop-care-target', targetId\)/
  );
  assert.match(
    source,
    /removeDesktopCareStartupItem:\s*\(itemName\) => ipcRenderer\.invoke\('remove-desktop-care-startup-item', itemName\)/
  );
});

test('main process registers desktop care menu entry and module', () => {
  const source = fs.readFileSync(mainPath, 'utf8');
  assert.match(source, /createDesktopCare/);
  assert.match(source, /电脑管家/);
  assert.match(source, /'desktop-care'/);
});

test('desktop care module scans cleanup targets and startup items', () => {
  const source = fs.readFileSync(modulePath, 'utf8');
  assert.match(source, /DEFAULT_CLEANUP_TARGETS/);
  assert.match(source, /getLoginItems/);
  assert.match(source, /removeLoginItem/);
  assert.match(source, /buildCleanupTargets/);
  assert.match(source, /ipcMain\.handle\('get-desktop-care-summary'/);
  assert.match(source, /ipcMain\.handle\('clean-desktop-care-target'/);
  assert.match(source, /ipcMain\.handle\('remove-desktop-care-startup-item'/);
  assert.match(source, /~\/\.npm/);
  assert.match(source, /inputPath === home/);
  assert.match(source, /startsWith\(home \+ path\.sep\)/);
  assert.match(source, /timeout: 8000/);
  assert.match(source, /Promise\.allSettled/);
  assert.match(source, /failed: cleanupResult\.failed/);
  assert.match(source, /normalizeStartupItemName/);
  assert.match(source, /toAppleScriptString/);
});

test('package includes renderer-desktop-care.js in packaged files', () => {
  const packageJson = fs.readFileSync(packagePath, 'utf8');
  assert.match(packageJson, /"renderer-desktop-care\.js"/);
});
