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
const rendererNewsPath = path.join(__dirname, '..', 'renderer-news.js');
const rendererTranslatePath = path.join(__dirname, '..', 'renderer-translate.js');
const rendererEffectsPath = path.join(__dirname, '..', 'renderer-effects.js');
const mainPath = path.join(__dirname, '..', 'main.js');
const chatIpcPath = path.join(__dirname, '..', 'lib', 'chat-ipc.js');
const secretsPath = path.join(__dirname, '..', 'lib', 'secrets.js');
const portMonitorPath = path.join(__dirname, '..', 'lib', 'port-monitor.js');
const systemMonitorPath = path.join(__dirname, '..', 'lib', 'system-monitor.js');
const webSearchIpcPath = path.join(__dirname, '..', 'lib', 'web-search-ipc.js');
const indexPath = path.join(__dirname, '..', 'index.html');
const packagePath = path.join(__dirname, '..', 'package.json');
const { normalizeChatPayload } = require(chatIpcPath);

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
  const chatIpc = fs.readFileSync(chatIpcPath, 'utf8');
  const portMonitor = fs.readFileSync(portMonitorPath, 'utf8');
  assert.match(source, /createPortMonitor\(\{/);
  assert.match(portMonitor, /function normalizePort\(port\)/);
  assert.match(portMonitor, /function normalizePid\(pid\)/);
  assert.match(source, /createChatIpc\(\{ ipcMain, unprotectSecret \}\)/);
  assert.match(chatIpc, /function normalizeChatPayload\(payload\)/);
  assert.match(source, /function normalizeRobotBounds\(bounds\)/);
  assert.match(source, /function normalizeContextMenuPoint\(point\)/);
  assert.match(portMonitor, /app\.getPath\('userData'\)/);
  assert.match(portMonitor, /function migrateLegacyPortsFile\(\)/);
  assert.match(portMonitor, /n < 1 \|\| n > 65535/);
  assert.match(portMonitor, /n === process\.pid/);
});

test('chat IPC validates base URL protocol and payload shape', () => {
  const source = fs.readFileSync(chatIpcPath, 'utf8');
  assert.match(source, /new URL\(baseUrl\)/);
  assert.match(source, /Unsupported base URL protocol/);
  assert.doesNotMatch(source, /HTTP base URL is only allowed for local debugging/);
  assert.doesNotMatch(source, /function isLocalDebugHttpHost\(hostname\)/);
  assert.match(source, /messages\s*\.\s*slice\(-30\)/);
  assert.match(source, /content: String\(message\?\.content \|\| ''\)\.slice\(0, 20000\)/);
  assert.match(source, /requestId: String\(payload\.requestId \|\| ''\)\.slice\(0, 80\)/);
  assert.match(source, /const activeChatRequests = new Map\(\)/);
  assert.match(source, /ipcMain\.handle\('cancel-chat'/);
});

test('chat IPC allows HTTP and HTTPS model endpoints', () => {
  const basePayload = {
    model: 'local-model',
    apiKey: 'x',
    messages: [{ role: 'user', content: 'hello' }]
  };

  assert.equal(normalizeChatPayload({ ...basePayload, baseUrl: 'http://localhost:11434/v1' }).error, undefined);
  assert.equal(normalizeChatPayload({ ...basePayload, baseUrl: 'http://127.0.0.1:11434/v1' }).error, undefined);
  assert.equal(normalizeChatPayload({ ...basePayload, baseUrl: 'http://192.168.1.20:11434/v1' }).error, undefined);
  assert.equal(normalizeChatPayload({ ...basePayload, baseUrl: 'http://example.com/v1' }).error, undefined);
  assert.equal(normalizeChatPayload({ ...basePayload, baseUrl: 'https://api.example.com/v1' }).error, undefined);
  assert.equal(
    normalizeChatPayload({ ...basePayload, baseUrl: 'file:///tmp/model' }).error,
    'Unsupported base URL protocol'
  );
});

test('browser window uses hardened web preferences', () => {
  const source = fs.readFileSync(mainPath, 'utf8');
  assert.match(source, /sandbox:\s*true/);
  assert.match(source, /contextIsolation:\s*true/);
  assert.match(source, /nodeIntegration:\s*false/);
  assert.match(source, /webSecurity:\s*true/);
  assert.match(source, /allowRunningInsecureContent:\s*false/);
});

test('packaged app includes vendored three runtime asset', () => {
  const html = fs.readFileSync(indexPath, 'utf8');
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  assert.match(html, /vendor\/three-global\.js/);
  assert.ok(pkg.build.files.includes('vendor/**'));
  assert.ok(pkg.build.files.includes('lib/**'));
});

test('README does not advertise removed chat web-search fallback', () => {
  const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
  assert.doesNotMatch(readme, /Web Fallback/i);
  assert.doesNotMatch(readme, /联网回退/);
  assert.doesNotMatch(readme, /primary model call fails, automatically search the web/i);
  assert.doesNotMatch(readme, /主模型调用失败时，自动网页搜索/);
});

test('kill-process uses process.kill instead of shell kill commands', () => {
  const source = fs.readFileSync(portMonitorPath, 'utf8');
  assert.doesNotMatch(source, /execAsync\(`kill/);
  assert.doesNotMatch(source, /kill -TERM|kill -KILL/);
  assert.match(source, /process\.kill\(normalizedPid,\s*'SIGTERM'\)/);
  assert.match(source, /process\.kill\(normalizedPid,\s*'SIGKILL'\)/);
});

test('kill-process only kills pids found in a fresh listening-process scan', () => {
  const source = fs.readFileSync(portMonitorPath, 'utf8');
  const handlerMatch = source.match(/ipcMain\.handle\('kill-process',[\s\S]*?\n\s*\}\);/);
  assert.ok(handlerMatch, 'kill-process handler not found');
  const handlerSource = handlerMatch[0];

  // Must re-scan currently listening processes and reject pids outside that set
  // before calling process.kill, instead of trusting the renderer-supplied pid blindly.
  assert.match(handlerSource, /scanListeningProcessesFresh\(\)/);
  assert.match(handlerSource, /processes\.some\(\(?p\)? => p\.pid === normalizedPid\)/);
  assert.match(handlerSource, /return \{ success: false, error: '该进程未在监听端口中，拒绝终止' \};/);
});

test('main process protects and unprotects API keys with safeStorage', () => {
  const main = fs.readFileSync(mainPath, 'utf8');
  const source = fs.readFileSync(secretsPath, 'utf8');
  assert.match(main, /createSecretStore\(safeStorage\)/);
  assert.match(source, /const PROTECTED_SECRET_PREFIX = 'safe:v1:'/);
  assert.match(source, /function protectSecret\(secret\)/);
  assert.match(source, /safeStorage\.encryptString\(value\)/);
  assert.match(source, /function unprotectSecret\(secret\)/);
  assert.match(source, /safeStorage\.decryptString\(encrypted\)/);
  assert.match(main, /ipcMain\.handle\('protect-secret'/);
});

test('chat decrypts protected API keys in the main process', () => {
  const source = fs.readFileSync(chatIpcPath, 'utf8');
  const main = fs.readFileSync(mainPath, 'utf8');
  assert.match(main, /const \{ protectSecret, unprotectSecret \} = secretStore/);
  assert.match(source, /const resolvedApiKey = unprotectSecret\(apiKey\)/);
  assert.match(source, /'x-api-key': resolvedApiKey/);
  assert.match(source, /Authorization:\s*`Bearer \$\{resolvedApiKey\}`/);
  assert.doesNotMatch(source, /'x-api-key': apiKey/);
  assert.doesNotMatch(source, /Authorization:\s*`Bearer \$\{apiKey\}`/);
});

test('preload exposes secret protection without exposing decrypt', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');
  assert.match(source, /protectSecret:\s*\(secret\) => ipcRenderer\.invoke\('protect-secret', secret\)/);
  assert.match(source, /cancelChat:\s*\(requestId\) => ipcRenderer\.invoke\('cancel-chat', requestId\)/);
  assert.match(source, /onSyncMouseCapture:\s*\(cb\) => ipcRenderer\.on\('sync-mouse-capture', \(\) => cb\(\)\)/);
  assert.match(source, /openExternalUrl:\s*\(url\) => ipcRenderer\.invoke\('open-external-url', url\)/);
  assert.doesNotMatch(source, /webSearch:\s*\(|web-search/);
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
  assert.match(
    source,
    /settingTranslateApiKey\s*\.value\s*=\s*isProtectedSecretValue\(settings\.translateApiKey\)\s*\?\s*''/
  );
  assert.match(
    source,
    /translateApiKeyInput\s*\?\s*await protectSecretValue\(translateApiKeyInput\)\s*:\s*\(?existing\.translateApiKey \|\| ''\)?/
  );
});

test('system monitor avoids shell pipelines and overlapping refreshes', () => {
  const main = fs.readFileSync(mainPath, 'utf8');
  const systemMonitor = fs.readFileSync(systemMonitorPath, 'utf8');
  const portMonitor = fs.readFileSync(portMonitorPath, 'utf8');
  const renderer = fs.readFileSync(rendererPath, 'utf8');
  const monitor = fs.readFileSync(rendererMonitorPath, 'utf8');
  const html = fs.readFileSync(indexPath, 'utf8');
  assert.match(html, /id="system-monitor-refresh"/);
  assert.match(renderer, /const systemMonitorRefresh = document\.getElementById\('system-monitor-refresh'\)/);
  assert.match(renderer, /systemMonitorRefresh\.addEventListener\('click', refreshSystemStats\)/);
  assert.match(html, /id="port-monitor-refresh"/);
  assert.match(renderer, /const portMonitorRefresh = document\.getElementById\('port-monitor-refresh'\)/);
  assert.match(renderer, /portMonitorRefresh\.addEventListener\('click', refreshPortStats\)/);
  assert.match(renderer, /function setMonitorRefreshButtonState\(button, loading, showLoadingText = true\)/);
  assert.match(renderer, /button\.disabled = loading/);
  assert.match(renderer, /button\.textContent = loading && showLoadingText \? '刷新中\.\.\.' : '刷新'/);
  assert.match(renderer, /setMonitorRefreshButtonState\(systemMonitorRefresh, true\)/);
  assert.match(renderer, /setMonitorRefreshButtonState\(portMonitorRefresh, true, false\)/);
  assert.doesNotMatch(main, /execAsync/);
  assert.doesNotMatch(systemMonitor, /execAsync/);
  assert.doesNotMatch(portMonitor, /execAsync/);
  assert.doesNotMatch(main, /netstat -ibn|awk|grep|tail -1/);
  assert.doesNotMatch(systemMonitor, /netstat -ibn|awk|grep|tail -1/);
  assert.doesNotMatch(portMonitor, /netstat -ibn|awk|grep|tail -1/);
  assert.match(main, /createSystemMonitor\(\{/);
  assert.match(systemMonitor, /execFileAsync\('\/usr\/sbin\/netstat', \['-ibn'\]/);
  assert.match(
    systemMonitor,
    /execFileAsync\(\s*'\/usr\/sbin\/ioreg'\s*,\s*\['-c', 'IOBlockStorageDriver', '-r', '-k', 'Statistics'\]/
  );
  assert.match(systemMonitor, /execFileAsync\('\/usr\/bin\/top', \['-l', '2', '-n', '0', '-s', '1'\]/);
  assert.match(renderer, /let systemStatsInFlight = false/);
  assert.match(renderer, /if \(systemStatsInFlight\) return/);
  assert.match(renderer, /let portStatsInFlight = false/);
  assert.match(renderer, /if \(portStatsInFlight\) return/);
  assert.match(main, /const SYSTEM_STATS_CACHE_TTL_MS = 1500/);
  assert.match(main, /const LISTENING_PROCESSES_CACHE_TTL_MS = 2000/);
  assert.match(main, /function getCachedValue\(cache, ttlMs, producer\)/);
  assert.match(main, /cacheTtlMs: SYSTEM_STATS_CACHE_TTL_MS/);
  assert.match(systemMonitor, /getCachedValue\(systemStatsCache, cacheTtlMs, buildSystemStats\)/);
  assert.match(main, /cacheTtlMs: LISTENING_PROCESSES_CACHE_TTL_MS/);
  assert.match(portMonitor, /getCachedValue\(listeningProcessesCache, cacheTtlMs, scanListeningProcessesFresh\)/);
  assert.match(portMonitor, /execFileAsync\('\/usr\/sbin\/lsof', \['-nP', '\+c', '0', '-iTCP', '-sTCP:LISTEN'\]/);
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
  assert.ok(html.indexOf('renderer-dom.js') < html.indexOf('renderer-robot3d.js'));
  assert.ok(html.indexOf('renderer-robot3d.js') < html.indexOf('renderer-monitor.js'));
  assert.ok(html.indexOf('renderer-monitor.js') < html.indexOf('renderer-settings.js'));
  assert.ok(html.indexOf('renderer-settings.js') < html.indexOf('renderer-chat.js'));
  assert.ok(html.indexOf('renderer-chat.js') < html.indexOf('renderer-reminder.js'));
  assert.ok(html.indexOf('renderer-reminder.js') < html.indexOf('renderer-news.js'));
  assert.ok(html.indexOf('renderer-news.js') < html.indexOf('renderer-translate.js'));
  assert.ok(html.indexOf('renderer-translate.js') < html.indexOf('renderer-effects.js'));
  assert.ok(html.indexOf('renderer-effects.js') < html.indexOf('renderer-todo.js'));
  assert.ok(html.indexOf('renderer-todo.js') < html.indexOf('renderer-desktop-care.js'));
  assert.ok(html.indexOf('renderer-desktop-care.js') < html.indexOf('renderer.js'));
  assert.match(packageJson, /renderer-settings\.js/);
  assert.match(packageJson, /renderer-robot3d\.js/);
  assert.match(packageJson, /renderer-chat\.js/);
  assert.match(packageJson, /renderer-reminder\.js/);
  assert.match(packageJson, /renderer-news\.js/);
  assert.match(packageJson, /renderer-translate\.js/);
  assert.match(packageJson, /renderer-effects\.js/);
  assert.match(packageJson, /renderer-desktop-care\.js/);
});

test('settings chat and reminder modules own their event binding', () => {
  const settings = fs.readFileSync(rendererSettingsPath, 'utf8');
  const chat = fs.readFileSync(rendererChatPath, 'utf8');
  const reminder = fs.readFileSync(rendererReminderPath, 'utf8');
  const news = fs.readFileSync(rendererNewsPath, 'utf8');
  const translate = fs.readFileSync(rendererTranslatePath, 'utf8');
  const effects = fs.readFileSync(rendererEffectsPath, 'utf8');
  const renderer = fs.readFileSync(rendererPath, 'utf8');
  assert.match(settings, /bindSettingsEvents/);
  assert.match(chat, /bindChatEvents/);
  assert.match(reminder, /function bindReminderEvents\(\)/);
  assert.match(news, /function bindNewsEvents\(\)/);
  assert.match(translate, /function bindTranslateEvents\(\)/);
  assert.match(effects, /function bindRobotClick\(\)/);
  assert.match(renderer, /settingsController\.bindSettingsEvents\(\)/);
  assert.match(renderer, /chatController\.bindChatEvents\(\)/);
  assert.match(renderer, /reminderController\.bindReminderEvents/);
  assert.match(renderer, /newsController\.bindNewsEvents\(\)/);
  assert.match(renderer, /translateController\.bindTranslateEvents\(\)/);
  assert.match(renderer, /effectsController\.bindRobotClick\(\)/);
  assert.match(renderer, /if \(!effectsController\) return;/);
});

test('mousemove perspective work is throttled with requestAnimationFrame', () => {
  const source = fs.readFileSync(rendererPath, 'utf8');
  assert.match(source, /let pendingMouseMove = null/);
  assert.match(source, /let mouseMoveFrame = null/);
  assert.match(source, /function handleRobotMouseMove\(clientX, clientY\)/);
  assert.match(source, /mouseMoveFrame = requestAnimationFrame/);
});

test('CPU status lines do not append duplicate percent symbols', () => {
  const source = fs.readFileSync(rendererEffectsPath, 'utf8');
  assert.doesNotMatch(source, /CPU \$\{stats\.cpu\}%/);
  assert.match(source, /CPU \$\{stats\.cpu\}！！/);
  assert.match(source, /CPU \$\{stats\.cpu\}，还行还行/);
  assert.match(source, /CPU 才 \$\{stats\.cpu\}，/);
});

test('context menu close re-syncs mouse capture and clipboard restore avoids stomping newer copies', () => {
  const main = fs.readFileSync(mainPath, 'utf8');
  const renderer = fs.readFileSync(rendererPath, 'utf8');
  assert.match(main, /if \(clipboard\.readText\(\) === selectedRaw\) clipboard\.writeText\(oldClip\);/);
  assert.match(main, /win\.webContents\.send\('sync-mouse-capture'\)/);
  assert.match(main, /menu\.popup\(\{[\s\S]*callback:\s*\(\)\s*=>\s*\{[\s\S]*sync-mouse-capture/);
  assert.match(renderer, /window\.electronAPI\.onSyncMouseCapture\(\(\) => \{\s*updateMouseCapture\(\);/);
});

test('news links open externally through validated main-process shell calls', () => {
  const main = fs.readFileSync(mainPath, 'utf8');
  const webSearchIpc = fs.readFileSync(webSearchIpcPath, 'utf8');
  const news = fs.readFileSync(rendererNewsPath, 'utf8');
  assert.match(main, /createWebSearchIpc\(\{ ipcMain, shell \}\)/);
  assert.match(webSearchIpc, /function normalizeExternalUrl\(url\)/);
  assert.match(webSearchIpc, /parsed\.protocol !== 'https:' && parsed\.protocol !== 'http:'/);
  assert.match(webSearchIpc, /ipcMain\.handle\('open-external-url'/);
  assert.match(webSearchIpc, /shell\.openExternal\(normalizedUrl\)/);
  assert.match(news, /window\.electronAPI\.openExternalUrl\(url\)/);
});

test('chat web search IPC is not registered or exposed', () => {
  const main = fs.readFileSync(mainPath, 'utf8');
  const preload = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');
  const webSearchIpc = fs.readFileSync(webSearchIpcPath, 'utf8');
  const chat = fs.readFileSync(rendererChatPath, 'utf8');

  assert.doesNotMatch(main, /ipcMain\.handle\('web-search'/);
  assert.doesNotMatch(preload, /webSearch|web-search/);
  assert.doesNotMatch(
    webSearchIpc,
    /ipcMain\.handle\('web-search'|normalizeWebSearchPayload|parseDuckDuckGoResults|parseBingResults|parseSoResults/
  );
  assert.doesNotMatch(chat, /window\.electronAPI\.webSearch|autoWebFallback|webSearchTopK/);
});

test('main process blocks renderer navigation, popups, webviews, and permission requests', () => {
  const main = fs.readFileSync(mainPath, 'utf8');

  assert.match(main, /function lockDownWebContents\(webContents\)/);
  assert.match(main, /webContents\.setWindowOpenHandler\(\(\) => \(\{ action: 'deny' \}\)\)/);
  assert.match(main, /webContents\.on\('will-navigate', \(event\) => \{\s*event\.preventDefault\(\);\s*\}\)/);
  assert.match(main, /webContents\.on\('will-redirect', \(event\) => \{\s*event\.preventDefault\(\);\s*\}\)/);
  assert.match(main, /webContents\.on\('will-attach-webview', \(event\) => \{\s*event\.preventDefault\(\);\s*\}\)/);
  assert.match(main, /webContents\.session\.setPermissionRequestHandler\([^]*?callback\(false\)/);
  assert.match(main, /lockDownWebContents\(win\.webContents\);/);
});

test('direct main-process IPC only accepts the application renderer', () => {
  const main = fs.readFileSync(mainPath, 'utf8');

  assert.match(main, /function isTrustedIpcSender\(event\)/);
  assert.match(main, /event\.sender === win\.webContents/);
  assert.match(
    main,
    /ipcMain\.on\('set-ignore-mouse-events', \(event, ignore\) => \{\s*if \(!isTrustedIpcSender\(event\) \|\| typeof ignore !== 'boolean'\) return;/
  );
  assert.match(
    main,
    /ipcMain\.on\('set-robot-bounds', \(event, bounds\) => \{\s*if \(!isTrustedIpcSender\(event\)\) return;/
  );
  assert.match(
    main,
    /ipcMain\.on\('show-context-menu', async \(event, point\) => \{\s*if \(!isTrustedIpcSender\(event\)\) return;/
  );
  assert.match(
    main,
    /ipcMain\.handle\('protect-secret', \(event, secret\) => \{\s*if \(!isTrustedIpcSender\(event\)\)/
  );
});

test('global right-click menu is deferred until after mouse release', () => {
  const main = fs.readFileSync(mainPath, 'utf8');

  assert.match(main, /function popupRobotMenuAtScreenPoint\(screenX, screenY\)/);
  assert.match(main, /setTimeout\(async \(\) => \{/);
  assert.match(main, /popupRobotMenuAtScreenPoint\(e\.x, e\.y\)/);
});

test('app prevents duplicate robot instances from competing for global input hooks', () => {
  const main = fs.readFileSync(mainPath, 'utf8');

  assert.match(main, /const hasSingleInstanceLock = app\.requestSingleInstanceLock\(\)/);
  assert.match(main, /if \(!hasSingleInstanceLock\) \{\s*app\.quit\(\);/);
  assert.match(main, /app\.on\('second-instance'/);
  assert.match(main, /if \(!hasSingleInstanceLock\) return;/);
});
