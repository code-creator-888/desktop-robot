const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rendererPath = path.join(__dirname, '..', 'renderer.js');
const rendererDomPath = path.join(__dirname, '..', 'renderer-dom.js');
const rendererMonitorPath = path.join(__dirname, '..', 'renderer-monitor.js');
const rendererSettingsPath = path.join(__dirname, '..', 'renderer-settings.js');
const rendererChatPath = path.join(__dirname, '..', 'renderer-chat.js');
const rendererReminderPath = path.join(__dirname, '..', 'renderer-reminder.js');
const mainPath = path.join(__dirname, '..', 'main.js');
const indexPath = path.join(__dirname, '..', 'index.html');
const packagePath = path.join(__dirname, '..', 'package.json');

test('renderer does not inject dynamic templates with innerHTML', () => {
  const source = fs.readFileSync(rendererPath, 'utf8');
  const domSource = fs.readFileSync(rendererDomPath, 'utf8');
  assert.doesNotMatch(source, /innerHTML\s*=\s*`[\s\S]*\$\{/);
  assert.match(domSource, /function appendTextElement\(/);
  assert.match(domSource, /\.textContent\s*=/);
});

test('renderer safely renders user-controlled reminder and session fields', () => {
  const chat = fs.readFileSync(rendererChatPath, 'utf8');
  const reminder = fs.readFileSync(rendererReminderPath, 'utf8');
  assert.match(reminder, /appendTextElement\(main,\s*'div',\s*'reminder-item-title',\s*item\.title\)/);
  assert.match(chat, /appendTextElement\(info,\s*'span',\s*'session-item-preview',\s*s\.preview \|\| '空对话'\)/);
});

test('main process validates port and pid IPC inputs', () => {
  const source = fs.readFileSync(mainPath, 'utf8');
  assert.match(source, /function normalizePort\(port\)/);
  assert.match(source, /function normalizePid\(pid\)/);
  assert.match(source, /n < 1 \|\| n > 65535/);
  assert.match(source, /n === process\.pid/);
});

test('kill-process uses process.kill instead of shell kill commands', () => {
  const source = fs.readFileSync(mainPath, 'utf8');
  assert.doesNotMatch(source, /execAsync\(`kill/);
  assert.doesNotMatch(source, /kill -TERM|kill -KILL/);
  assert.match(source, /process\.kill\(normalizedPid,\s*'SIGTERM'\)/);
  assert.match(source, /process\.kill\(normalizedPid,\s*'SIGKILL'\)/);
});

test('kill-process only kills pids found in a fresh listening-process scan', () => {
  const source = fs.readFileSync(mainPath, 'utf8');
  const handlerMatch = source.match(/ipcMain\.handle\('kill-process',[\s\S]*?\n\}\);/);
  assert.ok(handlerMatch, 'kill-process handler not found');
  const handlerSource = handlerMatch[0];

  // Must re-scan currently listening processes and reject pids outside that set
  // before calling process.kill, instead of trusting the renderer-supplied pid blindly.
  assert.match(handlerSource, /scanListeningProcesses\(\)/);
  assert.match(handlerSource, /processes\.some\(\(?p\)? => p\.pid === normalizedPid\)/);
  assert.match(handlerSource, /return \{ success: false, error: '该进程未在监听端口中，拒绝终止' \};/);
});

test('main process protects and unprotects API keys with safeStorage', () => {
  const source = fs.readFileSync(mainPath, 'utf8');
  assert.match(source, /safeStorage/);
  assert.match(source, /const PROTECTED_SECRET_PREFIX = 'safe:v1:'/);
  assert.match(source, /function protectSecret\(secret\)/);
  assert.match(source, /safeStorage\.encryptString\(value\)/);
  assert.match(source, /function unprotectSecret\(secret\)/);
  assert.match(source, /safeStorage\.decryptString\(encrypted\)/);
  assert.match(source, /ipcMain\.handle\('protect-secret'/);
});

test('chat decrypts protected API keys in the main process', () => {
  const source = fs.readFileSync(mainPath, 'utf8');
  assert.match(source, /const resolvedApiKey = unprotectSecret\(apiKey\)/);
  assert.match(source, /'x-api-key': resolvedApiKey/);
  assert.match(source, /'Authorization': `Bearer \$\{resolvedApiKey\}`/);
  assert.doesNotMatch(source, /'x-api-key': apiKey/);
  assert.doesNotMatch(source, /'Authorization': `Bearer \$\{apiKey\}`/);
});

test('preload exposes secret protection without exposing decrypt', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');
  assert.match(source, /protectSecret:\s*\(secret\) => ipcRenderer\.invoke\('protect-secret', secret\)/);
  assert.doesNotMatch(source, /decrypt|unprotect/i);
});

test('renderer stores protected API keys and preserves existing keys on blank edits', () => {
  const source = fs.readFileSync(rendererSettingsPath, 'utf8');
  assert.match(source, /const SECRET_PREFIXES = \['safe:v1:', 'plain:v1:'\]/);
  assert.match(source, /async function protectSecretValue\(value\)/);
  assert.match(source, /window\.electronAPI\.protectSecret\(secret\)/);
  assert.match(source, /async function migrateStoredSecrets\(\)/);
  assert.match(source, /model\.apiKey = await protectSecretValue\(model\.apiKey\)/);
  assert.match(source, /if \(inputApiKey\) m\.apiKey = await protectSecretValue\(inputApiKey\)/);
  assert.match(source, /editModelApiKey\.value = isProtectedSecretValue\(m\.apiKey\) \? ''/);
});

test('model menu uses sanitized renderer state instead of executeJavaScript', () => {
  const main = fs.readFileSync(mainPath, 'utf8');
  const settings = fs.readFileSync(rendererSettingsPath, 'utf8');
  const preload = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');
  assert.doesNotMatch(main, /executeJavaScript/);
  assert.match(main, /function normalizeModelMenuState\(state\)/);
  assert.match(main, /ipcMain\.on\('set-model-menu-state'/);
  assert.match(preload, /setModelMenuState:\s*\(state\) => ipcRenderer\.send\('set-model-menu-state', state\)/);
  assert.match(settings, /function syncModelMenuState\(\)/);
  assert.match(settings, /window\.electronAPI\.setModelMenuState/);
  assert.doesNotMatch(settings, /apiKey:\s*m\.apiKey/);
});

test('translation API key settings are protected and preserved when blank', () => {
  const source = fs.readFileSync(rendererSettingsPath, 'utf8');
  assert.match(source, /settingTranslateApiKey\.value = isProtectedSecretValue\(settings\.translateApiKey\) \? ''/);
  assert.match(source, /translateApiKeyInput \? await protectSecretValue\(translateApiKeyInput\) : \(existing\.translateApiKey \|\| ''\)/);
});

test('system monitor avoids shell pipelines and overlapping refreshes', () => {
  const main = fs.readFileSync(mainPath, 'utf8');
  const renderer = fs.readFileSync(rendererPath, 'utf8');
  const monitor = fs.readFileSync(rendererMonitorPath, 'utf8');
  assert.doesNotMatch(main, /execAsync/);
  assert.doesNotMatch(main, /netstat -ibn|awk|grep|tail -1/);
  assert.match(main, /execFileAsync\('\/usr\/sbin\/netstat', \['-ibn'\]/);
  assert.match(main, /execFileAsync\('\/usr\/sbin\/ioreg', \['-c', 'IOBlockStorageDriver', '-r', '-k', 'Statistics'\]/);
  assert.match(main, /execFileAsync\('\/usr\/bin\/top', \['-l', '2', '-n', '0', '-s', '1'\]/);
  assert.match(renderer, /let systemStatsInFlight = false/);
  assert.match(renderer, /if \(systemStatsInFlight\) return/);
  assert.match(renderer, /let portStatsInFlight = false/);
  assert.match(renderer, /if \(portStatsInFlight\) return/);
  assert.match(monitor, /function renderProcessList\(listId, processes\)/);
  assert.match(monitor, /function renderWatchedPorts\(data, handlers = \{\}\)/);
});

test('renderer document declares a restrictive content security policy', () => {
  const source = fs.readFileSync(indexPath, 'utf8');
  assert.match(source, /http-equiv="Content-Security-Policy"/);
  assert.match(source, /default-src 'self'/);
  assert.match(source, /script-src 'self'/);
  assert.match(source, /connect-src 'none'/);
  assert.match(source, /object-src 'none'/);
});

test('renderer feature modules are loaded before the main renderer', () => {
  const html = fs.readFileSync(indexPath, 'utf8');
  const packageJson = fs.readFileSync(packagePath, 'utf8');
  assert.ok(html.indexOf('renderer-dom.js') < html.indexOf('renderer-monitor.js'));
  assert.ok(html.indexOf('renderer-monitor.js') < html.indexOf('renderer-settings.js'));
  assert.ok(html.indexOf('renderer-settings.js') < html.indexOf('renderer-chat.js'));
  assert.ok(html.indexOf('renderer-chat.js') < html.indexOf('renderer-reminder.js'));
  assert.ok(html.indexOf('renderer-reminder.js') < html.indexOf('renderer.js'));
  assert.match(packageJson, /renderer-settings\.js/);
  assert.match(packageJson, /renderer-chat\.js/);
  assert.match(packageJson, /renderer-reminder\.js/);
});

test('settings chat and reminder modules own their event binding', () => {
  const settings = fs.readFileSync(rendererSettingsPath, 'utf8');
  const chat = fs.readFileSync(rendererChatPath, 'utf8');
  const reminder = fs.readFileSync(rendererReminderPath, 'utf8');
  const renderer = fs.readFileSync(rendererPath, 'utf8');
  assert.match(settings, /bindSettingsEvents/);
  assert.match(chat, /bindChatEvents/);
  assert.match(reminder, /function bindReminderEvents\(\)/);
  assert.match(renderer, /settingsController\.bindSettingsEvents\(\)/);
  assert.match(renderer, /chatController\.bindChatEvents\(\)/);
  assert.match(renderer, /reminderController\.bindReminderEvents/);
});

test('mousemove perspective work is throttled with requestAnimationFrame', () => {
  const source = fs.readFileSync(rendererPath, 'utf8');
  assert.match(source, /let pendingMouseMove = null/);
  assert.match(source, /let mouseMoveFrame = null/);
  assert.match(source, /function handleRobotMouseMove\(clientX, clientY\)/);
  assert.match(source, /mouseMoveFrame = requestAnimationFrame/);
});

test('CPU status lines do not append duplicate percent symbols', () => {
  const source = fs.readFileSync(rendererPath, 'utf8');
  assert.doesNotMatch(source, /CPU \$\{stats\.cpu\}%/);
  assert.match(source, /CPU \$\{stats\.cpu\}！！/);
  assert.match(source, /CPU \$\{stats\.cpu\}，还行还行/);
  assert.match(source, /CPU 才 \$\{stats\.cpu\}，/);
});
