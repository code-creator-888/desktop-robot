const PETS = {
  robot: {
    name: '机器人',
    src: 'assets/robot.svg',
    size: 64
  }
};

const PET_PERSONALITIES = {
  robot: {
    name: '机器人',
    personality: '一个可爱的小机器人，说话带点机械感但非常贴心，喜欢用简洁的语句回复，偶尔会说一些程序术语，对主人很忠诚'
  }
};

const WALK_SPEED = 1.8;

const petEl = document.getElementById('pet');
const container = document.getElementById('pet-container');
const speechBubble = document.getElementById('speech-bubble');
const chatPanel = document.getElementById('chat-panel');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSend = document.getElementById('chat-send');
const chatClose = document.getElementById('chat-close');
const settingsModal = document.getElementById('settings-modal');
const settingBaseUrl = document.getElementById('setting-base-url');
const settingModel = document.getElementById('setting-model');
const settingApiKey = document.getElementById('setting-api-key');
const settingProvider = document.getElementById('setting-provider');
const settingPetName = document.getElementById('setting-pet-name');
const settingSystemPrompt = document.getElementById('setting-system-prompt');
const settingSave = document.getElementById('setting-save');
const settingCancel = document.getElementById('setting-cancel');
const systemMonitor = document.getElementById('system-monitor');
const systemMonitorClose = document.getElementById('system-monitor-close');
const portMonitor = document.getElementById('port-monitor');
const portMonitorClose = document.getElementById('port-monitor-close');
const systemMonitorIntervalSelect = document.getElementById('system-monitor-interval');
const portMonitorIntervalSelect = document.getElementById('port-monitor-interval');

let currentPet = 'robot';
let behavior = 'idle';
let facingLeft = false;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let speechTimeout = null;
let isChatOpen = false;
let isSettingsOpen = false;
let isMonitorOpen = false;
let isThinking = false;
let systemMonitorInterval = null;
let portMonitorInterval = null;
let chatMessagesList = [];
let currentSessionId = null;
let envConfig = { baseUrl: '', model: '', apiKey: '' };

// --- Session management ---
const MAX_SESSIONS = 10;
const SESSIONS_KEY = 'chatSessions';
const LAST_SESSION_KEY = 'lastSessionId';

function loadSessions() {
  try { return JSON.parse(localStorage.getItem(SESSIONS_KEY)) || []; } catch { return []; }
}

function saveSessions(sessions) {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

function saveCurrentSession() {
  if (!currentSessionId || chatMessagesList.length === 0) return;
  let sessions = loadSessions();
  const idx = sessions.findIndex(s => s.id === currentSessionId);
  const preview = chatMessagesList[chatMessagesList.length - 1]?.content?.slice(0, 30) || '';
  if (idx >= 0) {
    sessions[idx].messages = chatMessagesList;
    sessions[idx].preview = preview;
    sessions[idx].updatedAt = Date.now();
  } else {
    sessions.unshift({ id: currentSessionId, messages: chatMessagesList, preview, createdAt: currentSessionId, updatedAt: Date.now() });
  }
  sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  if (sessions.length > MAX_SESSIONS) sessions = sessions.slice(0, MAX_SESSIONS);
  saveSessions(sessions);
  localStorage.setItem(LAST_SESSION_KEY, currentSessionId);
}

function startNewSession() {
  saveCurrentSession();
  currentSessionId = Date.now();
  chatMessagesList = [];
}

function switchToSession(id) {
  saveCurrentSession();
  const sessions = loadSessions();
  const session = sessions.find(s => s.id === id);
  if (!session) return;
  currentSessionId = session.id;
  chatMessagesList = session.messages || [];
  localStorage.setItem(LAST_SESSION_KEY, currentSessionId);
}

function initSession() {
  const lastId = parseInt(localStorage.getItem(LAST_SESSION_KEY), 10);
  if (lastId) {
    const sessions = loadSessions();
    const last = sessions.find(s => s.id === lastId);
    if (last) {
      currentSessionId = last.id;
      chatMessagesList = last.messages || [];
      return;
    }
  }
  currentSessionId = Date.now();
  chatMessagesList = [];
}

window.electronAPI.getEnvConfig().then((cfg) => {
  envConfig = cfg || { baseUrl: '', model: '', apiKey: '' };
});

function getPet() {
  return PETS[currentPet];
}

function getSystemPrompt() {
  const saved = localStorage.getItem('aiSettings');
  const settings = saved ? JSON.parse(saved) : {};
  if (settings.systemPrompt && settings.systemPrompt.trim()) {
    return settings.systemPrompt.trim();
  }
  const pet = getPet();
  const personality = PET_PERSONALITIES[currentPet];
  const name = (settings.petName && settings.petName.trim()) || pet.name;
  return `你是用户的桌面宠物，一只${name}。你性格${personality.personality}。
请用简短、可爱、口语化的中文回复，每次回复不超过50个字。
保持你的宠物人设，可以偶尔加上动作描述（用括号包裹，如"（摇尾巴）"）。
用户是你的主人，请亲切地称呼用户为"主人"。`;
}

function render() {
  const pet = getPet();

  petEl.src = pet.src;
  petEl.style.width = pet.size + 'px';
  petEl.style.height = pet.size + 'px';

  petEl.className = '';
  if (facingLeft) petEl.classList.add('flipped');
  if (behavior === 'walk') petEl.classList.add('walking');
  if (behavior === 'idle') petEl.classList.add('idle');
  if (behavior === 'sleep') petEl.classList.add('sleeping');
  if (behavior === 'eat') petEl.classList.add('eating');
  if (isThinking) petEl.classList.add('thinking');
}

function showSpeech(text, duration) {
  speechBubble.textContent = text;
  speechBubble.classList.remove('hidden');
  clearTimeout(speechTimeout);
  speechTimeout = setTimeout(() => {
    speechBubble.classList.add('hidden');
  }, duration || 2000);
}

// --- Settings ---
function loadSettings() {
  const saved = localStorage.getItem('aiSettings');
  if (saved) {
    const settings = JSON.parse(saved);
    settingBaseUrl.value = settings.baseUrl || envConfig.baseUrl;
    settingModel.value = settings.model || envConfig.model;
    settingProvider.value = settings.provider || (envConfig.baseUrl.includes('anthropic') ? 'anthropic' : 'openai');
    settingApiKey.value = settings.apiKey || envConfig.apiKey;
    settingPetName.value = settings.petName || '';
    settingSystemPrompt.value = settings.systemPrompt || '';
  } else {
    settingBaseUrl.value = envConfig.baseUrl;
    settingModel.value = envConfig.model;
    settingProvider.value = envConfig.baseUrl.includes('anthropic') ? 'anthropic' : 'openai';
    settingApiKey.value = envConfig.apiKey;
    settingPetName.value = '';
    settingSystemPrompt.value = '';
  }
}

function getSettings() {
  const saved = localStorage.getItem('aiSettings');
  if (saved) {
    const settings = JSON.parse(saved);
    if (!settings.provider) {
      settings.provider = envConfig.baseUrl.includes('anthropic') ? 'anthropic' : 'openai';
    }
    if (!settings.baseUrl && envConfig.baseUrl) {
      settings.baseUrl = envConfig.baseUrl;
    }
    if (!settings.model && envConfig.model) {
      settings.model = envConfig.model;
    }
    if (!settings.apiKey && envConfig.apiKey) {
      settings.apiKey = envConfig.apiKey;
    }
    return settings;
  }
  if (envConfig.apiKey || envConfig.baseUrl) {
    return {
      baseUrl: envConfig.baseUrl,
      model: envConfig.model,
      provider: envConfig.baseUrl.includes('anthropic') ? 'anthropic' : 'openai',
      apiKey: envConfig.apiKey
    };
  }
  return null;
}

function saveSettings() {
  const settings = {
    baseUrl: settingBaseUrl.value.trim(),
    model: settingModel.value.trim(),
    provider: settingProvider.value,
    apiKey: settingApiKey.value.trim(),
    petName: settingPetName.value.trim(),
    systemPrompt: settingSystemPrompt.value.trim()
  };
  localStorage.setItem('aiSettings', JSON.stringify(settings));
  closeSettings();
}

function openSettings() {
  isSettingsOpen = true;
  loadSettings();
  settingsModal.classList.remove('hidden');
  window.electronAPI.setIgnoreMouseEvents(false);
}

function closeSettings() {
  isSettingsOpen = false;
  settingsModal.classList.add('hidden');
  if (!isDragging && !isChatOpen) {
    window.electronAPI.setIgnoreMouseEvents(true);
  }
}

// --- Chat ---
function openChat() {
  isChatOpen = true;
  chatPanel.classList.remove('hidden');
  window.electronAPI.setIgnoreMouseEvents(false);
  initSession();
  renderSessionBar();
  renderChatMessages();
  chatInput.focus();
}

function closeChat() {
  saveCurrentSession();
  isChatOpen = false;
  chatPanel.classList.add('hidden');
  if (!isDragging && !isSettingsOpen) {
    window.electronAPI.setIgnoreMouseEvents(true);
  }
}

function renderChatMessages() {
  chatMessages.innerHTML = '';
  chatMessagesList.forEach((msg) => {
    const div = document.createElement('div');
    div.className = 'chat-message ' + (msg.role === 'user' ? 'user' : 'pet');
    div.textContent = msg.content;

    chatMessages.appendChild(div);
  });

  if (isThinking) {
    const div = document.createElement('div');
    div.className = 'chat-message pet thinking-msg';
    div.textContent = '思考中...';
    chatMessages.appendChild(div);
  }

  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function renderSessionBar() {
  const bar = document.getElementById('chat-session-bar');
  if (!bar) return;
  const sessions = loadSessions();
  const date = currentSessionId ? new Date(currentSessionId).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  const msgCount = chatMessagesList.length;

  bar.innerHTML = '';

  const info = document.createElement('span');
  info.className = 'session-info';
  info.textContent = msgCount > 0 ? `${date} · ${Math.floor(msgCount / 2)}条` : '新对话';
  bar.appendChild(info);

  const actions = document.createElement('div');
  actions.className = 'session-actions';

  if (sessions.length > 0) {
    const histBtn = document.createElement('button');
    histBtn.className = 'session-btn';
    histBtn.title = '历史对话';
    histBtn.textContent = '历史';
    histBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleSessionList(bar, sessions);
    });
    actions.appendChild(histBtn);
  }

  const newBtn = document.createElement('button');
  newBtn.className = 'session-btn session-btn-new';
  newBtn.title = '新建对话';
  newBtn.textContent = '+ 新建';
  newBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeSessionList();
    startNewSession();
    renderSessionBar();
    renderChatMessages();
    chatInput.focus();
  });
  actions.appendChild(newBtn);
  bar.appendChild(actions);
}

function toggleSessionList(bar, sessions) {
  const existing = document.getElementById('session-list-dropdown');
  if (existing) { existing.remove(); return; }

  const dropdown = document.createElement('div');
  dropdown.id = 'session-list-dropdown';

  sessions.forEach(s => {
    const item = document.createElement('div');
    item.className = 'session-list-item' + (s.id === currentSessionId ? ' active' : '');
    const d = new Date(s.id).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    item.innerHTML = `<span class="session-item-date">${d}</span><span class="session-item-preview">${s.preview || '空对话'}</span>`;
    item.addEventListener('click', () => {
      switchToSession(s.id);
      closeSessionList();
      renderSessionBar();
      renderChatMessages();
    });
    dropdown.appendChild(item);
  });

  bar.parentElement.insertBefore(dropdown, bar.nextSibling);

  const onOutside = (e) => {
    if (!dropdown.contains(e.target) && e.target.closest('#chat-session-bar') === null) {
      closeSessionList();
      document.removeEventListener('click', onOutside);
    }
  };
  setTimeout(() => document.addEventListener('click', onOutside), 0);
}

function closeSessionList() {
  const el = document.getElementById('session-list-dropdown');
  if (el) el.remove();
}

async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text || isThinking) return;

  const settings = getSettings();
  if (!settings || !settings.baseUrl || !settings.model || !settings.apiKey) {
    openSettings();
    return;
  }

  chatInput.value = '';
  chatMessagesList.push({ role: 'user', content: text });
  renderChatMessages();

  isThinking = true;
  render();

  const messages = [
    { role: 'system', content: getSystemPrompt() },
    ...chatMessagesList.slice(-10)
  ];

  const result = await window.electronAPI.chat({
    baseUrl: settings.baseUrl,
    model: settings.model,
    apiKey: settings.apiKey,
    provider: settings.provider,
    messages
  });

  isThinking = false;

  if (result.success) {
    chatMessagesList.push({ role: 'assistant', content: result.content });
    renderChatMessages();
    if (!isChatOpen) showSpeech(result.content, 4000);
  } else {
    const errMsg = '出错了：' + result.error;
    chatMessagesList.push({ role: 'assistant', content: errMsg });
    renderChatMessages();
    if (!isChatOpen) showSpeech(errMsg, 3000);
  }

  saveCurrentSession();
  renderSessionBar();
  render();
}

// --- Tab switching helper ---
function switchTab(panelEl, tabName) {
  panelEl.querySelectorAll('.monitor-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  panelEl.querySelectorAll('.monitor-tab-content').forEach(el => {
    el.classList.toggle('active', el.id === 'tab-' + tabName);
  });
}

// --- System Monitor ---
async function refreshSystemStats() {
  const stats = await window.electronAPI.getSystemStats();
  if (!stats || stats.error) return;

  document.getElementById('stat-cpu').textContent = stats.cpu;
  document.getElementById('stat-cpu-model').textContent = `${stats.cpuModel} (${stats.cpuCount}核)`;
  document.getElementById('stat-mem').textContent = `${stats.memUsed} / ${stats.memTotal}`;
  document.getElementById('stat-mem-percent').textContent = stats.memPercent;
  document.getElementById('stat-load').textContent = stats.loadAvg;
  document.getElementById('stat-uptime').textContent = stats.uptime;
  document.getElementById('stat-net-in').textContent = stats.netIn;
  document.getElementById('stat-net-out').textContent = stats.netOut;
  document.getElementById('stat-disk-read').textContent = stats.diskRead;
  document.getElementById('stat-disk-write').textContent = stats.diskWrite;

  renderProcessList('proc-cpu-list', stats.topByCpu);
  renderProcessList('proc-mem-list', stats.topByMem);
}

function renderProcessList(listId, processes) {
  const el = document.getElementById(listId);
  if (!el || !Array.isArray(processes)) return;
  el.innerHTML = '';
  processes.forEach(p => {
    const row = document.createElement('div');
    row.className = 'proc-row';
    row.innerHTML = `
      <span class="proc-col-cmd" title="${p.cmd} [${p.pid}]">${p.cmd}</span>
      <span class="proc-col-cpu">${p.cpu}</span>
      <span class="proc-col-mem">${p.mem}</span>
      <span class="proc-col-pid">${p.pid}</span>
    `;
    el.appendChild(row);
  });
}

function openSystemMonitor() {
  isMonitorOpen = true;
  systemMonitor.classList.remove('hidden');
  window.electronAPI.setIgnoreMouseEvents(false);
  switchTab(systemMonitor, 'overview');

  const saved = localStorage.getItem('systemMonitorInterval');
  if (saved) systemMonitorIntervalSelect.value = saved;

  refreshSystemStats();
  systemMonitorInterval = setInterval(refreshSystemStats, parseInt(systemMonitorIntervalSelect.value, 10));

  systemMonitorIntervalSelect._onChange = () => {
    localStorage.setItem('systemMonitorInterval', systemMonitorIntervalSelect.value);
    clearInterval(systemMonitorInterval);
    systemMonitorInterval = setInterval(refreshSystemStats, parseInt(systemMonitorIntervalSelect.value, 10));
  };
  systemMonitorIntervalSelect.addEventListener('change', systemMonitorIntervalSelect._onChange);
}

function closeSystemMonitor() {
  systemMonitor.classList.add('hidden');
  clearInterval(systemMonitorInterval);
  systemMonitorInterval = null;
  if (systemMonitorIntervalSelect._onChange) {
    systemMonitorIntervalSelect.removeEventListener('change', systemMonitorIntervalSelect._onChange);
    systemMonitorIntervalSelect._onChange = null;
  }
  if (portMonitor.classList.contains('hidden')) {
    isMonitorOpen = false;
  }
  // Keep mouse events enabled so the pet remains interactive after closing
  window.electronAPI.setIgnoreMouseEvents(false);
}

systemMonitor.querySelectorAll('.monitor-tab').forEach(btn => {
  btn.addEventListener('click', () => switchTab(systemMonitor, btn.dataset.tab));
});

// --- Port Monitor ---
async function refreshPortStats() {
  const data = await window.electronAPI.getPortStats();
  if (!data || data.error) return;
  renderWatchedPorts(data);
  renderAllPorts(data);
}

function renderWatchedPorts(data) {
  const list = document.getElementById('port-watched-list');
  if (!list) return;
  list.innerHTML = '';

  for (const port of data.ports) {
    const processes = data.portMap[port] || [];
    const item = document.createElement('div');
    item.className = 'port-item';

    const badge = processes.length > 0
      ? `<span class="port-badge occupied">占用 ${processes.length}</span>`
      : `<span class="port-badge free">空闲</span>`;

    item.innerHTML = `
      <div class="port-item-header">
        <span class="port-item-number">:${port}</span>
        <div class="port-item-actions">
          ${badge}
          <button class="port-remove-btn" data-port="${port}" title="移除">✕</button>
        </div>
      </div>
    `;

    processes.forEach(proc => {
      const row = document.createElement('div');
      row.className = 'port-process-row';
      row.innerHTML = `
        <span class="port-proc-cmd" title="${proc.command}">${proc.command}</span>
        <span class="port-proc-addr">${proc.addr}</span>
        <span class="port-proc-pid">PID ${proc.pid}</span>
        <button class="port-kill-btn" data-pid="${proc.pid}" data-cmd="${proc.command}">Kill</button>
      `;
      item.appendChild(row);
    });

    list.appendChild(item);
  }

  list.querySelectorAll('.port-remove-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const port = parseInt(btn.dataset.port, 10);
      await window.electronAPI.removePort(port);
      refreshPortStats();
    });
  });

  list.querySelectorAll('.port-kill-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const pid = parseInt(btn.dataset.pid, 10);
      const result = await window.electronAPI.killProcess(pid);
      if (!result.success) {
        alert(`Kill 失败 (PID ${pid}): ${result.error}`);
        return;
      }
      setTimeout(refreshPortStats, 800);
    });
  });
}

function renderAllPorts(data) {
  const summary = document.getElementById('all-ports-summary');
  const list = document.getElementById('all-ports-list');
  if (!summary || !list) return;

  summary.textContent = `共 ${data.allCount} 个监听端口，显示前 ${data.allListening.length} 个`;
  list.innerHTML = '';

  data.allListening.forEach(p => {
    const row = document.createElement('div');
    row.className = 'all-port-row';
    row.innerHTML = `
      <span class="all-port-num">${p.port}</span>
      <span class="all-port-cmd" title="${p.command}">${p.command}</span>
      <span class="all-port-addr">${p.addr}</span>
      <span class="all-port-user">${p.user}</span>
      <span class="all-port-pid">${p.pid}</span>
    `;
    list.appendChild(row);
  });
}

function openPortMonitor() {
  isMonitorOpen = true;
  portMonitor.classList.remove('hidden');
  window.electronAPI.setIgnoreMouseEvents(false);
  switchTab(portMonitor, 'watched');

  const saved = localStorage.getItem('portMonitorInterval');
  if (saved) portMonitorIntervalSelect.value = saved;

  refreshPortStats();
  portMonitorInterval = setInterval(refreshPortStats, parseInt(portMonitorIntervalSelect.value, 10));

  portMonitorIntervalSelect._onChange = () => {
    localStorage.setItem('portMonitorInterval', portMonitorIntervalSelect.value);
    clearInterval(portMonitorInterval);
    portMonitorInterval = setInterval(refreshPortStats, parseInt(portMonitorIntervalSelect.value, 10));
  };
  portMonitorIntervalSelect.addEventListener('change', portMonitorIntervalSelect._onChange);
}

function closePortMonitor() {
  portMonitor.classList.add('hidden');
  clearInterval(portMonitorInterval);
  portMonitorInterval = null;
  if (portMonitorIntervalSelect._onChange) {
    portMonitorIntervalSelect.removeEventListener('change', portMonitorIntervalSelect._onChange);
    portMonitorIntervalSelect._onChange = null;
  }
  if (systemMonitor.classList.contains('hidden')) {
    isMonitorOpen = false;
  }
  // Keep mouse events enabled so the pet remains interactive after closing
  window.electronAPI.setIgnoreMouseEvents(false);
}

portMonitor.querySelectorAll('.monitor-tab').forEach(btn => {
  btn.addEventListener('click', () => switchTab(portMonitor, btn.dataset.tab));
});

document.getElementById('port-add-btn').addEventListener('click', async () => {
  const input = document.getElementById('port-add-input');
  const port = parseInt(input.value.trim(), 10);
  if (!port || port < 1 || port > 65535) return;
  const result = await window.electronAPI.addPort(port);
  if (result.success) {
    input.value = '';
    refreshPortStats();
  }
});

document.getElementById('port-add-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('port-add-btn').click();
});

// --- Drag ---
function reportPetBounds() {
  const rect = container.getBoundingClientRect();
  window.electronAPI.setPetBounds({
    x: Math.round(rect.left + window.screenX),
    y: Math.round(rect.top + window.screenY),
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  });
}

container.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  isDragging = true;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  container.classList.add('dragging');
  window.electronAPI.setIgnoreMouseEvents(false);
});

window.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;
  dragStartX = e.clientX;
  dragStartY = e.clientY;

  const rect = container.getBoundingClientRect();
  container.style.left = (rect.left + dx) + 'px';
  container.style.bottom = (window.innerHeight - rect.bottom - dy) + 'px';
  reportPetBounds();
});

window.addEventListener('mouseup', () => {
  if (isDragging) {
    isDragging = false;
    container.classList.remove('dragging');
    behavior = 'idle';
    render();
    reportPetBounds();
    if (!isChatOpen && !isSettingsOpen && !isMonitorOpen) {
      window.electronAPI.setIgnoreMouseEvents(true);
    }
  }
});

// --- Mouse enter/leave for click passthrough ---
container.addEventListener('mouseenter', () => {
  window.electronAPI.setIgnoreMouseEvents(false);
});

container.addEventListener('mouseleave', () => {
  if (!isDragging && !isChatOpen && !isSettingsOpen && !isMonitorOpen) {
    window.electronAPI.setIgnoreMouseEvents(true);
  }
});

// --- Context menu (native) ---
container.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  window.electronAPI.showContextMenu(e.clientX, e.clientY);
});

window.electronAPI.onMenuAction((action) => {
  if (action === 'chat') {
    if (isChatOpen) {
      closeChat();
    } else {
      openChat();
    }
  } else if (action === 'settings') {
    openSettings();
  } else if (action === 'system-monitor') {
    if (isMonitorOpen && !systemMonitor.classList.contains('hidden')) {
      closeSystemMonitor();
    } else {
      openSystemMonitor();
    }
  } else if (action === 'port-monitor') {
    if (isMonitorOpen && !portMonitor.classList.contains('hidden')) {
      closePortMonitor();
    } else {
      openPortMonitor();
    }
  }
});

systemMonitorClose.addEventListener('click', closeSystemMonitor);
systemMonitor.querySelector('.monitor-backdrop').addEventListener('click', closeSystemMonitor);
portMonitorClose.addEventListener('click', closePortMonitor);
portMonitor.querySelector('.monitor-backdrop').addEventListener('click', closePortMonitor);

// --- Chat events ---
chatSend.addEventListener('click', sendMessage);
chatClose.addEventListener('click', closeChat);
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendMessage();
});

// --- Global key events ---
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (isChatOpen) closeChat();
    if (isSettingsOpen) closeSettings();
    if (isMonitorOpen) {
      if (!systemMonitor.classList.contains('hidden')) closeSystemMonitor();
      if (!portMonitor.classList.contains('hidden')) closePortMonitor();
    }
  }
});

// --- Settings events ---
settingSave.addEventListener('click', saveSettings);
settingCancel.addEventListener('click', closeSettings);
settingsModal.querySelector('.settings-backdrop').addEventListener('click', closeSettings);

// --- Init ---
container.style.left = (window.innerWidth - getPet().size - 20) + 'px';
render();
reportPetBounds();
