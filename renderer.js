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
const settingPetName = document.getElementById('setting-pet-name');
const settingSystemPrompt = document.getElementById('setting-system-prompt');
const settingAutoWebFallback = document.getElementById('setting-auto-web-fallback');
const settingWebSearchTopK = document.getElementById('setting-web-search-topk');
const modelListEl = document.getElementById('model-list');
const modelAddBtn = document.getElementById('model-add-btn');
const modelEditForm = document.getElementById('model-edit-form');
const editModelName = document.getElementById('edit-model-name');
const editModelProvider = document.getElementById('edit-model-provider');
const editModelId = document.getElementById('edit-model-id');
const editModelBaseUrl = document.getElementById('edit-model-baseurl');
const editModelApiKey = document.getElementById('edit-model-apikey');
const editModelSave = document.getElementById('edit-model-save');
const editModelCancel = document.getElementById('edit-model-cancel');
const chatModelIndicator = document.getElementById('chat-model-indicator');
const settingSave = document.getElementById('setting-save');
const settingCancel = document.getElementById('setting-cancel');
const systemMonitor = document.getElementById('system-monitor');
const systemMonitorClose = document.getElementById('system-monitor-close');
const portMonitor = document.getElementById('port-monitor');
const portMonitorClose = document.getElementById('port-monitor-close');
const systemMonitorIntervalSelect = document.getElementById('system-monitor-interval');
const portMonitorIntervalSelect = document.getElementById('port-monitor-interval');
const reminderCenter = document.getElementById('reminder-center');
const reminderCenterClose = document.getElementById('reminder-center-close');
const reminderAddTitle = document.getElementById('reminder-add-title');
const reminderAddTime = document.getElementById('reminder-add-time');
const reminderRuleType = document.getElementById('reminder-rule-type');
const reminderAddBtn = document.getElementById('reminder-add-btn');
const reminderListEl = document.getElementById('reminder-list');

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
let isReminderOpen = false;
let systemMonitorInterval = null;
let portMonitorInterval = null;
let chatMessagesList = [];
let currentSessionId = null;
let envConfig = { baseUrl: '', model: '', apiKey: '' };
let reminderItems = [];

// --- Session management ---
const MAX_SESSIONS = 10;
const SESSIONS_KEY = 'chatSessions';
const LAST_SESSION_KEY = 'lastSessionId';
const DEFAULT_AUTO_WEB_FALLBACK = true;
const DEFAULT_WEB_SEARCH_TOPK = 5;
const REMINDER_STORAGE_KEY = 'reminderItems';

function clampWebSearchTopK(value) {
  const n = Number.isFinite(Number(value)) ? Number(value) : DEFAULT_WEB_SEARCH_TOPK;
  if (n < 3) return 3;
  if (n > 8) return 8;
  return Math.floor(n);
}

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
  container.classList.toggle('thinking-tech', isThinking);
}

function showSpeech(text, duration, persistent) {
  speechBubble.textContent = text;
  speechBubble.classList.remove('hidden');
  speechBubble.classList.toggle('clickable', !!persistent);
  clearTimeout(speechTimeout);
  if (persistent || !duration || duration <= 0) return;
  speechTimeout = setTimeout(() => {
    speechBubble.classList.add('hidden');
    speechBubble.classList.remove('clickable');
  }, duration);
}

// --- Model config management ---
const MODEL_CONFIGS_KEY = 'modelConfigs';

function loadModelConfigs() {
  try {
    const raw = localStorage.getItem(MODEL_CONFIGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function saveModelConfigs(configs) {
  localStorage.setItem(MODEL_CONFIGS_KEY, JSON.stringify(configs));
}

function migrateOldSettings() {
  if (loadModelConfigs()) return;
  const saved = localStorage.getItem('aiSettings');
  if (!saved) return;
  try {
    const old = JSON.parse(saved);
    if (old.baseUrl || old.model || old.apiKey) {
      const provider = old.provider || (old.baseUrl && old.baseUrl.includes('anthropic') ? 'anthropic' : 'openai');
      const id = Date.now().toString();
      saveModelConfigs({
        models: [{
          id,
          name: old.model || '默认模型',
          provider,
          model: old.model || '',
          baseUrl: old.baseUrl || '',
          apiKey: old.apiKey || ''
        }],
        activeId: id
      });
    }
  } catch {}
}
migrateOldSettings();

function getModelConfigs() {
  let configs = loadModelConfigs();
  if (!configs) {
    const id = Date.now().toString();
    configs = { models: [], activeId: '' };
  }
  return configs;
}

function getActiveModel() {
  const configs = getModelConfigs();
  return configs.models.find(m => m.id === configs.activeId) || null;
}

function switchModel(id) {
  const configs = getModelConfigs();
  if (configs.models.some(m => m.id === id)) {
    configs.activeId = id;
    saveModelConfigs(configs);
    updateModelIndicator();
  }
}

let editingModelId = null;

function renderModelList() {
  const configs = getModelConfigs();
  modelListEl.innerHTML = '';
  if (configs.models.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'model-item';
    empty.innerHTML = '<span style="color:#999;font-size:12px">暂无模型，点击下方添加</span>';
    modelListEl.appendChild(empty);
    return;
  }
  configs.models.forEach(m => {
    const item = document.createElement('div');
    item.className = 'model-item' + (m.id === configs.activeId ? ' active' : '');

    const dot = document.createElement('span');
    dot.className = 'model-item-dot';

    const name = document.createElement('span');
    name.className = 'model-item-name';
    name.textContent = m.name;

    const detail = document.createElement('span');
    detail.className = 'model-item-detail';
    detail.textContent = m.model;

    const actions = document.createElement('div');
    actions.className = 'model-item-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'model-item-btn';
    editBtn.textContent = '编辑';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openModelEditForm(m.id);
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'model-item-btn delete';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteModel(m.id);
    });

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    item.appendChild(dot);
    item.appendChild(name);
    item.appendChild(detail);
    item.appendChild(actions);

    item.addEventListener('click', () => {
      switchModel(m.id);
      renderModelList();
    });

    modelListEl.appendChild(item);
  });
}

function openModelEditForm(id) {
  editingModelId = id || null;
  if (id) {
    const configs = getModelConfigs();
    const m = configs.models.find(x => x.id === id);
    if (!m) return;
    editModelName.value = m.name;
    editModelProvider.value = m.provider || 'openai';
    editModelId.value = m.model || '';
    editModelBaseUrl.value = m.baseUrl || '';
    editModelApiKey.value = m.apiKey || '';
  } else {
    editModelName.value = '';
    editModelProvider.value = 'openai';
    editModelId.value = '';
    editModelBaseUrl.value = '';
    editModelApiKey.value = '';
  }
  modelEditForm.classList.remove('hidden');
  editModelName.focus();
}

function closeModelEditForm() {
  editingModelId = null;
  modelEditForm.classList.add('hidden');
}

function saveModelEdit() {
  const name = editModelName.value.trim();
  const model = editModelId.value.trim();
  if (!name || !model) return;

  const configs = getModelConfigs();
  if (editingModelId) {
    const m = configs.models.find(x => x.id === editingModelId);
    if (m) {
      m.name = name;
      m.provider = editModelProvider.value;
      m.model = model;
      m.baseUrl = editModelBaseUrl.value.trim();
      m.apiKey = editModelApiKey.value.trim();
    }
  } else {
    const id = Date.now().toString();
    configs.models.push({
      id,
      name,
      provider: editModelProvider.value,
      model,
      baseUrl: editModelBaseUrl.value.trim(),
      apiKey: editModelApiKey.value.trim()
    });
    if (!configs.activeId) configs.activeId = id;
  }
  saveModelConfigs(configs);
  closeModelEditForm();
  renderModelList();
  updateModelIndicator();
}

function deleteModel(id) {
  const configs = getModelConfigs();
  configs.models = configs.models.filter(m => m.id !== id);
  if (configs.activeId === id) {
    configs.activeId = configs.models.length > 0 ? configs.models[0].id : '';
  }
  saveModelConfigs(configs);
  renderModelList();
  updateModelIndicator();
}

function updateModelIndicator() {
  const m = getActiveModel();
  chatModelIndicator.textContent = m ? m.name : '';
}

modelAddBtn.addEventListener('click', () => openModelEditForm(null));
editModelSave.addEventListener('click', saveModelEdit);
editModelCancel.addEventListener('click', closeModelEditForm);

// --- Settings ---
function loadSettings() {
  const saved = localStorage.getItem('aiSettings');
  const settings = saved ? JSON.parse(saved) : {};
  const autoWebFallback = settings.autoWebFallback !== false;
  const webSearchTopK = clampWebSearchTopK(settings.webSearchTopK);

  if (saved) {
    settingPetName.value = settings.petName || '';
    settingSystemPrompt.value = settings.systemPrompt || '';
  } else {
    settingPetName.value = '';
    settingSystemPrompt.value = '';
  }

  settingAutoWebFallback.checked = autoWebFallback;
  settingWebSearchTopK.value = String(webSearchTopK);
  renderModelList();
  closeModelEditForm();
}

function getSettings() {
  const model = getActiveModel();
  if (!model || !model.baseUrl || !model.model || !model.apiKey) return null;
  const saved = localStorage.getItem('aiSettings');
  const extra = saved ? JSON.parse(saved) : {};
  return {
    baseUrl: model.baseUrl,
    model: model.model,
    apiKey: model.apiKey,
    provider: model.provider || 'openai',
    petName: extra.petName || '',
    systemPrompt: extra.systemPrompt || '',
    autoWebFallback: extra.autoWebFallback !== false,
    webSearchTopK: clampWebSearchTopK(extra.webSearchTopK)
  };
}

function saveSettings() {
  const settings = {
    petName: settingPetName.value.trim(),
    systemPrompt: settingSystemPrompt.value.trim(),
    autoWebFallback: !!settingAutoWebFallback.checked,
    webSearchTopK: clampWebSearchTopK(settingWebSearchTopK.value)
  };
  localStorage.setItem('aiSettings', JSON.stringify(settings));
  closeSettings();
}

function openSettings() {
  isSettingsOpen = true;
  loadSettings();
  settingsModal.classList.remove('hidden');
  setMouseCapture(true);
}

function closeSettings() {
  isSettingsOpen = false;
  settingsModal.classList.add('hidden');
  if (!isDragging && !isChatOpen && !isMonitorOpen && !isReminderOpen) {
    setMouseCapture(false);
  }
}

function loadReminderItems() {
  try {
    const raw = localStorage.getItem(REMINDER_STORAGE_KEY);
    if (!raw) return [];
    const items = JSON.parse(raw);
    if (!Array.isArray(items)) return [];
    return items
      .filter(item => item && item.id && item.title && (item.dueAt || item.nextTriggerAt))
      .map((item) => {
        const ruleType = item.rule?.type || 'one-time';
        return {
          ...item,
          rule: {
            type: ['one-time', 'daily', 'weekly', 'workday'].includes(ruleType) ? ruleType : 'one-time'
          },
          nextTriggerAt: item.nextTriggerAt || item.dueAt
        };
      });
  } catch {
    return [];
  }
}

function saveReminderItems() {
  localStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(reminderItems));
}

function formatReminderTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatReminderRule(type) {
  if (type === 'daily') return '每天';
  if (type === 'weekly') return '每周';
  if (type === 'workday') return '工作日';
  return '仅一次';
}

function computeNextTriggerAt(item, nowTs) {
  const base = new Date(nowTs);
  if (Number.isNaN(base.getTime())) return null;
  const ruleType = item.rule?.type || 'one-time';
  if (ruleType === 'one-time') return null;
  if (ruleType === 'daily') {
    return new Date(base.getTime() + 24 * 60 * 60 * 1000).toISOString();
  }
  if (ruleType === 'weekly') {
    return new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  }
  if (ruleType === 'workday') {
    const d = new Date(base);
    do {
      d.setDate(d.getDate() + 1);
    } while (d.getDay() === 0 || d.getDay() === 6);
    return d.toISOString();
  }
  return null;
}

function renderReminderList() {
  if (!reminderListEl) return;
  reminderListEl.innerHTML = '';
  const sorted = [...reminderItems].sort((a, b) => new Date(a.nextTriggerAt || a.dueAt).getTime() - new Date(b.nextTriggerAt || b.dueAt).getTime());

  sorted.forEach((item) => {
    const ruleType = item.rule?.type || 'one-time';

    const row = document.createElement('div');
    row.className = 'reminder-item' + (item.status === 'done' ? ' done' : '');
    row.innerHTML = `
      <div class="reminder-item-main">
        <div class="reminder-item-title">${item.title}</div>
        <div class="reminder-item-meta">${formatReminderTime(item.nextTriggerAt || item.dueAt)} · ${formatReminderRule(ruleType)}</div>
      </div>
      <div class="reminder-item-actions">
        <button class="reminder-done-btn" data-id="${item.id}">完成</button>
        <button class="reminder-delete-btn" data-id="${item.id}">删除</button>
      </div>
    `;
    reminderListEl.appendChild(row);
  });

  reminderListEl.querySelectorAll('.reminder-done-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const item = reminderItems.find(x => x.id === id);
      if (!item) return;
      item.status = 'done';
      saveReminderItems();
      renderReminderList();
    });
  });

  reminderListEl.querySelectorAll('.reminder-delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      reminderItems = reminderItems.filter(x => x.id !== id);
      saveReminderItems();
      renderReminderList();
    });
  });
}

function addManualReminder() {
  const title = reminderAddTitle.value.trim();
  const dueRaw = reminderAddTime.value;
  const dueAt = dueRaw ? new Date(dueRaw).toISOString() : '';
  const selectedRuleType = ['one-time', 'daily', 'weekly', 'workday'].includes(reminderRuleType?.value) ? reminderRuleType.value : 'one-time';
  if (!title || !dueAt) return;
  reminderItems.push({
    id: Date.now().toString() + Math.random().toString(16).slice(2, 8),
    title,
    dueAt,
    source: 'manual',
    rule: { type: selectedRuleType },
    nextTriggerAt: dueAt,
    status: 'pending',
    lastNotifiedAt: 0
  });
  saveReminderItems();
  renderReminderList();
  reminderAddTitle.value = '';
}

function checkDueReminders() {
  const now = Date.now();
  let dirty = false;
  for (const item of reminderItems) {
    if (item.status === 'done') continue;
    const triggerTs = new Date(item.nextTriggerAt || item.dueAt).getTime();
    if (Number.isNaN(triggerTs) || now < triggerTs) continue;
    const last = Number(item.lastNotifiedAt || 0);
    if (now - last < 5 * 60 * 1000) continue;
    item.lastNotifiedAt = now;
    showSpeech(`提醒：${item.title}`, 0, true);
    item.nextTriggerAt = computeNextTriggerAt(item, triggerTs);
    if (!item.nextTriggerAt) item.status = 'done';
    dirty = true;
  }
  if (dirty) {
    saveReminderItems();
    renderReminderList();
  }
}

function openReminderCenter() {
  isReminderOpen = true;
  reminderCenter.classList.remove('hidden');
  setMouseCapture(true);
  renderReminderList();
}

function closeReminderCenter() {
  isReminderOpen = false;
  reminderCenter.classList.add('hidden');
  if (!isDragging && !isSettingsOpen && !isMonitorOpen && !isChatOpen) {
    setMouseCapture(false);
  }
}

// --- Chat ---
function openChat() {
  isChatOpen = true;
  chatPanel.classList.remove('hidden');
  setMouseCapture(true);
  initSession();
  renderSessionBar();
  renderChatMessages();
  chatInput.focus();
}

function closeChat() {
  saveCurrentSession();
  isChatOpen = false;
  chatPanel.classList.add('hidden');
  if (!isDragging && !isSettingsOpen && !isMonitorOpen && !isReminderOpen) {
    setMouseCapture(false);
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

function deleteSession(id) {
  let sessions = loadSessions();
  sessions = sessions.filter(s => s.id !== id);
  saveSessions(sessions);

  if (currentSessionId === id) {
    if (sessions.length > 0) {
      switchToSession(sessions[0].id);
    } else {
      startNewSession();
      chatMessagesList = [];
    }
    renderChatMessages();
  }

  renderSessionBar();
  const bar = document.getElementById('chat-session-bar');
  if (sessions.length > 0) {
    toggleSessionList(bar, sessions);
  }
}

function toggleSessionList(bar, sessions) {
  const existing = document.getElementById('session-list-dropdown');
  if (existing) { existing.remove(); return; }

  const dropdown = document.createElement('div');
  dropdown.id = 'session-list-dropdown';

  sessions.forEach(s => {
    const item = document.createElement('div');
    item.className = 'session-list-item' + (s.id === currentSessionId ? ' active' : '');

    const info = document.createElement('div');
    info.className = 'session-item-info';
    const d = new Date(s.id).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    info.innerHTML = `<span class="session-item-date">${d}</span><span class="session-item-preview">${s.preview || '空对话'}</span>`;
    info.addEventListener('click', () => {
      switchToSession(s.id);
      closeSessionList();
      renderSessionBar();
      renderChatMessages();
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'session-item-delete';
    delBtn.title = '删除';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteSession(s.id);
    });

    item.appendChild(info);
    item.appendChild(delBtn);
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

  try {
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

    if (result.success) {
      chatMessagesList.push({ role: 'assistant', content: result.content });
      renderChatMessages();
      if (!isChatOpen) showSpeech(result.content, 4000);
    } else {
      if (settings.autoWebFallback) {
        const searchingMsg = '主回答失败，正在联网搜索并总结...';
        const searchingIndex = chatMessagesList.length;
        chatMessagesList.push({ role: 'assistant', content: searchingMsg });
        renderChatMessages();

        const searchResult = await window.electronAPI.webSearch({
          query: text,
          topK: settings.webSearchTopK
        });

        if (searchResult.success) {
          const evidence = (searchResult.results || []).map((item, index) =>
            `${index + 1}. ${item.title}\n${item.snippet}\n${item.url}`
          ).join('\n\n');
          const summarizeResult = await window.electronAPI.chat({
            baseUrl: settings.baseUrl,
            model: settings.model,
            apiKey: settings.apiKey,
            provider: settings.provider,
            messages: [
              { role: 'system', content: '你是检索总结助手。请根据证据回答问题，并在结尾附上来源链接。' },
              { role: 'user', content: `用户问题：${text}\n\n证据：\n${evidence}\n\n请给出简洁结论并列出来源链接。` }
            ]
          });

          if (summarizeResult.success) {
            chatMessagesList[searchingIndex] = { role: 'assistant', content: summarizeResult.content };
            renderChatMessages();
            if (!isChatOpen) showSpeech(summarizeResult.content, 4000);
          } else {
            const combinedError = `出错了：${result.error}；联网搜索成功，但总结失败：${summarizeResult.error}`;
            chatMessagesList[searchingIndex] = { role: 'assistant', content: combinedError };
            renderChatMessages();
            if (!isChatOpen) showSpeech(combinedError, 3000);
          }
        } else {
          const combinedError = `出错了：${result.error}；联网搜索失败：${searchResult.error}`;
          chatMessagesList[searchingIndex] = { role: 'assistant', content: combinedError };
          renderChatMessages();
          if (!isChatOpen) showSpeech(combinedError, 3000);
        }
      } else {
        const errMsg = '出错了：' + result.error;
        chatMessagesList.push({ role: 'assistant', content: errMsg });
        renderChatMessages();
        if (!isChatOpen) showSpeech(errMsg, 3000);
      }
    }
  } finally {
    isThinking = false;
    saveCurrentSession();
    renderSessionBar();
    render();
  }
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
  setMouseCapture(true);
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
  if (!isDragging && !isSettingsOpen && !isMonitorOpen && !isReminderOpen) {
    setMouseCapture(false);
  }
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
  setMouseCapture(true);
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
  if (!isDragging && !isSettingsOpen && !isMonitorOpen && !isReminderOpen) {
    setMouseCapture(false);
  }
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
  setMouseCapture(true);
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
    if (!isSettingsOpen && !isMonitorOpen) {
      setMouseCapture(false);
    }
  }
});

// --- Mouse passthrough via mousemove ---
let isCapturing = false;

function setMouseCapture(capture) {
  if (capture === isCapturing) return;
  isCapturing = capture;
  window.electronAPI.setIgnoreMouseEvents(!capture);
}

document.addEventListener('mousemove', (e) => {
  if (isDragging) return;
  if (isSettingsOpen || isMonitorOpen || isReminderOpen) return;
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const overContainer = !!(el && el.closest('#pet-container'));
  const overChatPanel = !!(el && el.closest('#chat-panel'));
  const overReminderCenter = !!(el && el.closest('#reminder-center'));
  setMouseCapture(overContainer || overChatPanel || overReminderCenter);
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
  } else if (action === 'reminder-center') {
    if (isReminderOpen) {
      closeReminderCenter();
    } else {
      openReminderCenter();
    }
  } else if (typeof action === 'string' && action.startsWith('switch-model:')) {
    const id = action.slice('switch-model:'.length);
    switchModel(id);
    if (isChatOpen) {
      setMouseCapture(true);
      chatInput.focus();
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
    if (isReminderOpen) closeReminderCenter();
  }
});

// --- Settings events ---
settingSave.addEventListener('click', saveSettings);
settingCancel.addEventListener('click', closeSettings);
settingsModal.querySelector('.settings-backdrop').addEventListener('click', closeSettings);
reminderCenterClose.addEventListener('click', closeReminderCenter);
reminderCenter.querySelector('.monitor-backdrop').addEventListener('click', closeReminderCenter);
reminderAddBtn.addEventListener('click', addManualReminder);
reminderAddTime.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addManualReminder();
});
speechBubble.addEventListener('click', () => {
  if (!speechBubble.classList.contains('clickable')) return;
  speechBubble.classList.add('hidden');
  speechBubble.classList.remove('clickable');
});

// --- Init ---
reminderItems = loadReminderItems();
checkDueReminders();
setInterval(checkDueReminders, 30000);
container.style.left = (window.innerWidth - getPet().size - 20) + 'px';
render();
reportPetBounds();
updateModelIndicator();
