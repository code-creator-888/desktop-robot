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
    personality:
      '一个可爱的小机器人，说话带点机械感但非常贴心，喜欢用简洁的语句回复，偶尔会说一些程序术语，对主人很忠诚'
  }
};

const WALK_SPEED = 1.8;
const SPEECH_WRAP_THRESHOLD = 18;

const petEl = document.getElementById('pet');
const container = document.getElementById('pet-container');
const petStage = document.getElementById('pet-stage');
const petDepthLayers = Array.from(document.querySelectorAll('#pet-depth-stack .pet-depth-layer'));
const robot3DHost = document.getElementById('robot-3d-host');
const speechBubble = document.getElementById('speech-bubble');
const snoozeBar = document.getElementById('snooze-bar');
const snoozeSelect = document.getElementById('snooze-select');
const snoozeBtn = document.getElementById('snooze-btn');
const chatPanel = document.getElementById('chat-panel');
const chatBackdrop = document.getElementById('chat-backdrop');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSend = document.getElementById('chat-send');
const chatClose = document.getElementById('chat-close');
const settingsModal = document.getElementById('settings-modal');
const settingPetName = document.getElementById('setting-pet-name');
const settingSystemPrompt = document.getElementById('setting-system-prompt');
const settingTranslateModelMode = document.getElementById('setting-translate-model-mode');
const settingTranslateCustom = document.getElementById('setting-translate-custom');
const settingTranslateBaseUrl = document.getElementById('setting-translate-baseurl');
const settingTranslateModel = document.getElementById('setting-translate-model');
const settingTranslateApiKey = document.getElementById('setting-translate-apikey');
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
const systemMonitorRefresh = document.getElementById('system-monitor-refresh');
const portMonitor = document.getElementById('port-monitor');
const portMonitorClose = document.getElementById('port-monitor-close');
const portMonitorRefresh = document.getElementById('port-monitor-refresh');
const desktopCare = document.getElementById('desktop-care');
const desktopCareClose = document.getElementById('desktop-care-close');
const desktopCareRefresh = document.getElementById('desktop-care-refresh');
const desktopCareStatus = document.getElementById('desktop-care-status');
const desktopCareSuggestions = document.getElementById('desktop-care-suggestions');
const desktopCareCleanupSummary = document.getElementById('desktop-care-cleanup-summary');
const desktopCareCleanupList = document.getElementById('desktop-care-cleanup-list');
const desktopCareStartupSummary = document.getElementById('desktop-care-startup-summary');
const desktopCareStartupList = document.getElementById('desktop-care-startup-list');
const desktopCareRisk = document.getElementById('desktop-care-risk');
const desktopCareCpu = document.getElementById('desktop-care-cpu');
const desktopCareMem = document.getElementById('desktop-care-mem');
const desktopCareDisk = document.getElementById('desktop-care-disk');
const desktopCareServices = document.getElementById('desktop-care-services');
const desktopCareCleanupSize = document.getElementById('desktop-care-cleanup-size');
const systemMonitorIntervalSelect = document.getElementById('system-monitor-interval');
const portMonitorIntervalSelect = document.getElementById('port-monitor-interval');
const reminderCenter = document.getElementById('reminder-center');
const reminderCenterClose = document.getElementById('reminder-center-close');
const reminderAddTitle = document.getElementById('reminder-add-title');
const reminderAddTime = document.getElementById('reminder-add-time');
const reminderRuleType = document.getElementById('reminder-rule-type');
const reminderAddBtn = document.getElementById('reminder-add-btn');
const reminderListEl = document.getElementById('reminder-list');
const newsPanel = document.getElementById('news-panel');
const newsPanelClose = document.getElementById('news-panel-close');
const newsPanelRefresh = document.getElementById('news-panel-refresh');
const newsPanelStatus = document.getElementById('news-panel-status');
const newsListEl = document.getElementById('news-list');
const todoList = document.getElementById('todo-list');
const todoListClose = document.getElementById('todo-list-close');
const todoAddTitle = document.getElementById('todo-add-title');
const todoAddDue = document.getElementById('todo-add-due');
const todoAddBtn = document.getElementById('todo-add-btn');
const todoItemsEl = document.getElementById('todo-items');
const { appendTextElement, appendButton, appendReminderRuleOptions } = window.RobotDOM;
const { renderProcessList, renderWatchedPorts, renderAllPorts } = window.RobotMonitor;

let currentPet = 'robot';
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
let isNewsOpen = false;
let isTodoOpen = false;
let isDesktopCareOpen = false;
let isDblClickAnimating = false;
let returnToDesktopCareAfterMonitor = false;
let systemMonitorInterval = null;
let portMonitorInterval = null;
let systemStatsInFlight = false;
let portStatsInFlight = false;
let envConfig = { baseUrl: '', model: '', apiKey: '' };
let robot3DController = null;
let currentPetSrc = '';
let reminderController = null;
let newsController = null;
let translateController = null;
let todoController;
let desktopCareController = null;
let settingsController = null;
let chatController = null;

function parseSettingsSafe() {
  return settingsController ? settingsController.parseSettingsSafe() : {};
}

window.electronAPI
  .getEnvConfig()
  .then((cfg) => {
    envConfig = cfg || { baseUrl: '', model: '', apiKey: '' };
  })
  .catch(() => {
    envConfig = { baseUrl: '', model: '', apiKey: '' };
  });

function getPet() {
  return PETS[currentPet];
}

function getSystemPrompt() {
  const settings = parseSettingsSafe();
  if (settings.systemPrompt && settings.systemPrompt.trim()) {
    return settings.systemPrompt.trim();
  }
  const pet = getPet();
  const personality = PET_PERSONALITIES[currentPet];
  const name = (settings.petName && settings.petName.trim()) || pet.name;
  return `你是用户的桌面机器人，一只${name}。你性格${personality.personality}。
请用简短、可爱、口语化的中文回复，每次回复不超过50个字。
保持你的机器人设，可以偶尔加上动作描述（用括号包裹，如"（摇尾巴）"）。
用户是你的主人，请亲切地称呼用户为"主人"。`;
}

function render() {
  const pet = getPet();

  petEl.src = pet.src;
  petStage.style.setProperty('--pet-image', `url("${pet.src}")`);
  petEl.style.width = pet.size + 'px';
  petEl.style.height = pet.size + 'px';
  petStage.style.width = pet.size + 'px';
  petStage.style.height = pet.size + 'px';
  petDepthLayers.forEach((layer, index) => {
    const depth = index + 1;
    if (pet.src !== currentPetSrc) {
      layer.style.backgroundImage = `url("${pet.src}")`;
    }
    layer.style.setProperty('--depth-x', `${depth * 1.2}px`);
    layer.style.setProperty('--depth-y', `${depth * 1.8}px`);
    layer.style.setProperty('--depth-z', `${-depth * 8}px`);
    layer.style.setProperty('--depth-scale', `${1 + depth * 0.012}`);
  });
  currentPetSrc = pet.src;

  const dblEffect = ['dbl-holo-scan', 'dbl-gravity-pulse', 'dbl-orbit-flare'].find((c) => petEl.classList.contains(c));
  const idleActionClass = ['yawn-yawn', 'yawn-stretch', 'yawn-rub-eyes'].find((c) => petEl.classList.contains(c));
  petEl.className = '';
  if (dblEffect) petEl.classList.add(dblEffect);
  if (idleActionClass) petEl.classList.add(idleActionClass);
  if (facingLeft) petEl.classList.add('flipped');
  container.classList.toggle('flipped-effects', facingLeft);
  petEl.classList.add('idle');
  if (isThinking) petEl.classList.add('thinking');
  container.classList.toggle('thinking-tech', isThinking);
}

function showSpeech(text, duration, persistent, type) {
  const isReminderAlert = type === 'reminder-alert';
  if (!isReminderAlert && reminderController && reminderController.hasActiveAlert()) return;
  if (!isReminderAlert) {
    snoozeBar.classList.add('hidden');
    if (reminderController) reminderController.clearCurrentAlert();
  }
  speechBubble.textContent = text;
  speechBubble.classList.remove('hidden', 'wrap', 'news', 'reminder-alert');
  speechBubble.classList.toggle('clickable', !!persistent);
  if (type === 'news') speechBubble.classList.add('news');
  else if (isReminderAlert) speechBubble.classList.add('reminder-alert');
  else speechBubble.classList.toggle('wrap', text.length > SPEECH_WRAP_THRESHOLD);
  speechBubble.classList.remove('speech-pop');
  void speechBubble.offsetWidth;
  speechBubble.classList.add('speech-pop');
  setTimeout(() => speechBubble.classList.remove('speech-pop'), 300);
  clearTimeout(speechTimeout);
  updateMouseCapture();
  if (persistent || !duration || duration <= 0) return;
  speechTimeout = setTimeout(() => {
    speechBubble.classList.add('hidden');
    speechBubble.classList.remove('clickable', 'news');
    updateMouseCapture();
  }, duration);
}

speechBubble.addEventListener('click', () => {
  if (speechBubble.classList.contains('hidden')) return;
  if (reminderController && reminderController.hasActiveAlert()) return;
  if (speechBubble.classList.contains('clickable') || speechBubble.classList.contains('news')) return;
  clearTimeout(speechTimeout);
  speechBubble.classList.add('hidden');
  speechBubble.classList.remove('clickable', 'news');
  updateMouseCapture();
});

function initRobot3D() {
  return robot3DController.initRobot3D();
}

function setRobot3DTarget(nx, ny, lift) {
  return robot3DController.setRobot3DTarget(nx, ny, lift);
}

function resetRobot3DTarget() {
  return robot3DController.resetRobot3DTarget();
}

robot3DController = window.Robot3D.createRobot3DController({
  petEl,
  petStage,
  robot3DHost,
  container
});

settingsController = window.RobotSettings.createSettingsController({
  elements: {
    settingsModal,
    settingPetName,
    settingSystemPrompt,
    settingTranslateModelMode,
    settingTranslateCustom,
    settingTranslateBaseUrl,
    settingTranslateModel,
    settingTranslateApiKey,
    modelListEl,
    modelAddBtn,
    modelEditForm,
    editModelName,
    editModelProvider,
    editModelId,
    editModelBaseUrl,
    editModelApiKey,
    editModelSave,
    editModelCancel,
    chatModelIndicator,
    settingSave,
    settingCancel
  },
  stopIdleAnimations,
  resumeIdleAnimationsIfAllowed,
  setMouseCapture,
  updateMouseCapture,
  setSettingsOpen: (open) => {
    isSettingsOpen = open;
  }
});

function initializeProtectedSecrets() {
  return settingsController.initializeProtectedSecrets();
}

function updateModelIndicator() {
  return settingsController.updateModelIndicator();
}

function switchModel(id) {
  return settingsController.switchModel(id);
}

function getSettings() {
  return settingsController.getSettings();
}

function getTranslateModelConfig() {
  return settingsController.getTranslateModelConfig();
}

function openSettings() {
  return settingsController.openSettings();
}

function closeSettings() {
  return settingsController.closeSettings();
}

reminderController = window.RobotReminder.createReminderController({
  elements: {
    reminderCenter,
    reminderCenterClose,
    reminderAddTitle,
    reminderAddTime,
    reminderRuleType,
    reminderAddBtn,
    reminderListEl,
    speechBubble,
    snoozeBar,
    snoozeSelect,
    snoozeBtn,
    petEl
  },
  dom: window.RobotDOM,
  showSpeech,
  setMouseCapture,
  reportRobotBounds,
  updateMouseCapture,
  stopIdleAnimations,
  resumeIdleAnimationsIfAllowed,
  clearSpeechTimeout: () => {
    clearTimeout(speechTimeout);
  },
  setReminderOpen: (open) => {
    isReminderOpen = open;
  },
  isReminderOpen: () => isReminderOpen
});

function openReminderCenter() {
  reminderController.openReminderCenter();
}

function closeReminderCenter() {
  reminderController.closeReminderCenter();
}

newsController = window.RobotNews.createNewsController({
  elements: {
    newsPanel,
    newsPanelClose,
    newsPanelRefresh,
    newsPanelStatus,
    newsListEl
  },
  appendTextElement,
  stopIdleAnimations,
  resumeIdleAnimationsIfAllowed,
  setMouseCapture,
  updateMouseCapture,
  setNewsOpen: (open) => {
    isNewsOpen = open;
  }
});

translateController = window.RobotTranslate.createTranslateController({
  getTranslateModelConfig,
  showSpeech,
  appendTranslateMessage: (content) => {
    chatController.appendTranslateMessage(content);
  }
});

todoController = window.RobotTodo.createTodoController({
  elements: {
    todoList,
    todoListClose,
    todoAddTitle,
    todoAddDue,
    todoAddBtn,
    todoItemsEl
  },
  dom: window.RobotDOM,
  setMouseCapture,
  stopIdleAnimations,
  resumeIdleAnimationsIfAllowed,
  updateMouseCapture,
  setTodoOpen: (open) => {
    isTodoOpen = open;
  }
});

function openNewsPanel() {
  newsController.openNewsPanel();
}

function closeNewsPanel() {
  newsController.closeNewsPanel();
}

function openTodoList() {
  todoController.openTodoList();
}

function closeTodoList() {
  todoController.closeTodoList();
}

desktopCareController = window.RobotDesktopCare.createDesktopCareController({
  elements: {
    desktopCare,
    desktopCareClose,
    desktopCareRefresh,
    desktopCareStatus,
    desktopCareSuggestions,
    desktopCareCleanupSummary,
    desktopCareCleanupList,
    desktopCareStartupSummary,
    desktopCareStartupList,
    desktopCareRisk,
    desktopCareCpu,
    desktopCareMem,
    desktopCareDisk,
    desktopCareServices,
    desktopCareCleanupSize
  },
  appendTextElement,
  appendButton,
  showSpeech,
  setMouseCapture,
  stopIdleAnimations,
  resumeIdleAnimationsIfAllowed,
  updateMouseCapture,
  setDesktopCareOpen: (open) => {
    isDesktopCareOpen = open;
  },
  openSystemMonitor: openSystemMonitorFromDesktopCare,
  openPortMonitor: openPortMonitorFromDesktopCare
});

function openDesktopCare() {
  desktopCareController.openDesktopCare();
}

function closeDesktopCare() {
  desktopCareController.closeDesktopCare();
}

function openSystemMonitorFromDesktopCare() {
  returnToDesktopCareAfterMonitor = true;
  openSystemMonitor();
}

function openPortMonitorFromDesktopCare() {
  returnToDesktopCareAfterMonitor = true;
  openPortMonitor();
}

// --- Chat ---
chatController = window.RobotChat.createChatController({
  elements: {
    chatPanel,
    chatBackdrop,
    chatMessages,
    chatInput,
    chatSend,
    chatClose
  },
  appendTextElement,
  stopIdleAnimations,
  resumeIdleAnimationsIfAllowed,
  setMouseCapture,
  updateMouseCapture,
  setChatOpen: (open) => {
    isChatOpen = open;
  },
  isChatOpen: () => isChatOpen,
  isThinking: () => isThinking,
  setThinking: (thinking) => {
    isThinking = thinking;
  },
  render,
  showSpeech,
  getSettings,
  openSettings,
  getSystemPrompt
});

function openChat() {
  return chatController.openChat();
}

function closeChat() {
  return chatController.closeChat();
}

function sendMessage() {
  return chatController.sendMessage();
}

// --- Tab switching helper ---
function switchTab(panelEl, tabName) {
  panelEl.querySelectorAll('.monitor-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  panelEl.querySelectorAll('.monitor-tab-content').forEach((el) => {
    el.classList.toggle('active', el.id === 'tab-' + tabName);
  });
}

function setMonitorRefreshButtonState(button, loading, showLoadingText = true) {
  button.disabled = loading;
  button.textContent = loading && showLoadingText ? '刷新中...' : '刷新';
}

// --- System Monitor ---
async function refreshSystemStats() {
  if (systemStatsInFlight) return;
  systemStatsInFlight = true;
  setMonitorRefreshButtonState(systemMonitorRefresh, true);
  let stats;
  try {
    stats = await window.electronAPI.getSystemStats();
  } finally {
    systemStatsInFlight = false;
    setMonitorRefreshButtonState(systemMonitorRefresh, false);
  }
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

function openSystemMonitor() {
  isMonitorOpen = true;
  stopIdleAnimations();
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
  if (returnToDesktopCareAfterMonitor && portMonitor.classList.contains('hidden')) {
    returnToDesktopCareAfterMonitor = false;
    openDesktopCare();
    return;
  }
  resumeIdleAnimationsIfAllowed();
  updateMouseCapture();
}

systemMonitor.querySelectorAll('.monitor-tab').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(systemMonitor, btn.dataset.tab));
});

// --- Port Monitor ---
async function refreshPortStats() {
  if (portStatsInFlight) return;
  portStatsInFlight = true;
  setMonitorRefreshButtonState(portMonitorRefresh, true, false);
  let data;
  try {
    data = await window.electronAPI.getPortStats();
  } finally {
    portStatsInFlight = false;
    setMonitorRefreshButtonState(portMonitorRefresh, false);
  }
  if (!data || data.error) return;
  renderWatchedPorts(data, {
    removePort: async (port) => {
      await window.electronAPI.removePort(port);
      refreshPortStats();
    },
    killProcess: async (pid) => {
      const result = await window.electronAPI.killProcess(pid);
      if (!result.success) {
        alert(`Kill 失败 (PID ${pid}): ${result.error}`);
        return;
      }
      setTimeout(refreshPortStats, 800);
    }
  });
  renderAllPorts(data);
}

function openPortMonitor() {
  isMonitorOpen = true;
  stopIdleAnimations();
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
  if (returnToDesktopCareAfterMonitor && systemMonitor.classList.contains('hidden')) {
    returnToDesktopCareAfterMonitor = false;
    openDesktopCare();
    return;
  }
  resumeIdleAnimationsIfAllowed();
  updateMouseCapture();
}

portMonitor.querySelectorAll('.monitor-tab').forEach((btn) => {
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
function reportRobotBounds() {
  const rect = container.getBoundingClientRect();
  const snoozeExtra = snoozeBar.classList.contains('hidden') ? 0 : 70;
  window.electronAPI.setRobotBounds({
    x: Math.round(rect.left + window.screenX),
    y: Math.round(rect.top + window.screenY - snoozeExtra),
    width: Math.round(rect.width),
    height: Math.round(rect.height + snoozeExtra)
  });
}

container.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  if (e.target.closest('#snooze-bar')) return;
  if (e.target.closest('#chat-panel')) return;
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
  container.style.left = rect.left + dx + 'px';
  container.style.bottom = window.innerHeight - rect.bottom - dy + 'px';
  reportRobotBounds();
});

window.addEventListener('mouseup', () => {
  if (isDragging) {
    isDragging = false;
    container.classList.remove('dragging');
    render();
    reportRobotBounds();
  }
});

// --- Mouse passthrough via mousemove ---
let isCapturing = false;

function setMouseCapture(capture) {
  if (capture === isCapturing) return;
  isCapturing = capture;
  window.electronAPI.setIgnoreMouseEvents(!capture);
}

// Sync isCapturing when main process directly calls win.setIgnoreMouseEvents (e.g. right-click menu)
window.electronAPI.onIgnoreMouseEventsChanged((ignore) => {
  isCapturing = !ignore;
});

window.electronAPI.onSyncMouseCapture(() => {
  updateMouseCapture();
});

function isScreenPointInsideElement(el, screenX, screenY) {
  if (!el || el.classList.contains('hidden')) return false;
  const rect = el.getBoundingClientRect();
  const localX = screenX - window.screenX;
  const localY = screenY - window.screenY;
  return localX >= rect.left && localX <= rect.right && localY >= rect.top && localY <= rect.bottom;
}

window.electronAPI.onGlobalMouseDown((point) => {
  if (!isChatOpen) return;
  if (isScreenPointInsideElement(chatPanel, point.x, point.y)) return;
  closeChat();
});

function resetPetPerspective() {
  petStage.style.setProperty('--tilt-x', '0deg');
  petStage.style.setProperty('--tilt-y', '0deg');
  petStage.style.setProperty('--stage-lift', '0px');
  petStage.style.setProperty('--shadow-scale', '1');
  resetRobot3DTarget();
  petDepthLayers.forEach((layer, index) => {
    const depth = index + 1;
    layer.style.setProperty('--depth-x', `${depth * 1.2}px`);
    layer.style.setProperty('--depth-y', `${depth * 1.8}px`);
    layer.style.setProperty('--depth-z', `${-depth * 8}px`);
    layer.style.setProperty('--depth-scale', `${1 + depth * 0.012}`);
  });
}

function updatePetPerspective(clientX, clientY) {
  const rect = petStage.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const nx = Math.max(-1, Math.min(1, ((clientX - rect.left) / rect.width) * 2 - 1));
  const ny = Math.max(-1, Math.min(1, ((clientY - rect.top) / rect.height) * 2 - 1));
  const tiltX = (nx * 14).toFixed(2);
  const tiltY = (-ny * 10).toFixed(2);
  const lift = Math.max(0, 10 - (Math.abs(nx) + Math.abs(ny)) * 4).toFixed(2);
  const shadowScale = (1 - Math.min(0.28, (Math.abs(nx) + Math.abs(ny)) * 0.08)).toFixed(3);

  petStage.style.setProperty('--tilt-x', `${tiltX}deg`);
  petStage.style.setProperty('--tilt-y', `${tiltY}deg`);
  petStage.style.setProperty('--stage-lift', `${lift}px`);
  petStage.style.setProperty('--shadow-scale', shadowScale);
  setRobot3DTarget(nx, ny, lift);
  petDepthLayers.forEach((layer, index) => {
    const depth = index + 1;
    const parallaxX = (nx * depth * 4.5).toFixed(2);
    const parallaxY = (ny * depth * 2.8).toFixed(2);
    layer.style.setProperty('--depth-x', `${depth * 1.2 + Number(parallaxX)}px`);
    layer.style.setProperty('--depth-y', `${depth * 1.8 + Number(parallaxY)}px`);
  });
}

function isInteractionOverlayOpen() {
  return (
    isSettingsOpen ||
    isMonitorOpen ||
    isReminderOpen ||
    isNewsOpen ||
    isTodoOpen ||
    isDesktopCareOpen ||
    isDblClickAnimating ||
    !snoozeBar.classList.contains('hidden') ||
    !speechBubble.classList.contains('hidden')
  );
}

function updateMouseCapture() {
  setMouseCapture(isDragging || isInteractionOverlayOpen());
}

let pendingMouseMove = null;
let mouseMoveFrame = null;

function handleRobotMouseMove(clientX, clientY) {
  if (isDragging) {
    resetPetPerspective();
    return;
  }
  if (isInteractionOverlayOpen()) {
    resetPetPerspective();
    return;
  }
  const rect = container.getBoundingClientRect();
  const pad = 20;
  const overContainer =
    clientX >= rect.left - pad &&
    clientX <= rect.right + pad &&
    clientY >= rect.top - pad &&
    clientY <= rect.bottom + pad;
  const el = document.elementFromPoint(clientX, clientY);
  const overChatPanel = !!(el && el.closest('#chat-panel'));
  const overReminderCenter = !!(el && el.closest('#reminder-center'));
  const overSettingsModal = !!(el && el.closest('#settings-modal'));
  const overTodoList = !!(el && el.closest('#todo-list'));
  const overDesktopCare = !!(el && el.closest('#desktop-care'));
  const overSystemMonitor = !!(el && el.closest('#system-monitor'));
  const overPortMonitor = !!(el && el.closest('#port-monitor'));
  // Use bounding rect for speech bubble since it overflows the container (top: -50px)
  const sbRect = speechBubble.getBoundingClientRect();
  const overSpeechBubble =
    !speechBubble.classList.contains('hidden') &&
    clientX >= sbRect.left &&
    clientX <= sbRect.right &&
    clientY >= sbRect.top &&
    clientY <= sbRect.bottom;
  if (isChatOpen) {
    resetPetPerspective();
  } else if (overContainer) {
    updatePetPerspective(clientX, clientY);
  } else {
    resetPetPerspective();
  }
  setMouseCapture(
    overContainer ||
      overChatPanel ||
      overReminderCenter ||
      overSettingsModal ||
      overTodoList ||
      overDesktopCare ||
      overSystemMonitor ||
      overPortMonitor ||
      overSpeechBubble
  );
}

document.addEventListener('mousemove', (e) => {
  pendingMouseMove = { clientX: e.clientX, clientY: e.clientY };
  if (mouseMoveFrame) return;
  mouseMoveFrame = requestAnimationFrame(() => {
    mouseMoveFrame = null;
    if (!pendingMouseMove) return;
    const { clientX, clientY } = pendingMouseMove;
    pendingMouseMove = null;
    handleRobotMouseMove(clientX, clientY);
  });
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
  } else if (action === 'desktop-care') {
    if (isDesktopCareOpen) {
      closeDesktopCare();
    } else {
      openDesktopCare();
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
  } else if (action === 'news-panel') {
    if (isNewsOpen) {
      closeNewsPanel();
    } else {
      openNewsPanel();
    }
  } else if (action === 'todo-list') {
    if (isTodoOpen) {
      closeTodoList();
    } else {
      openTodoList();
    }
  } else if (typeof action === 'string' && action.startsWith('switch-model:')) {
    const id = action.slice('switch-model:'.length);
    switchModel(id);
    if (isChatOpen) {
      setMouseCapture(true);
      chatInput.focus();
    }
  } else if (action === 'test-idle-yawn') {
    testIdleAnimation('yawn');
  } else if (action === 'test-idle-stretch') {
    testIdleAnimation('stretch');
  } else if (action === 'test-idle-rub-eyes') {
    testIdleAnimation('rub-eyes');
  }
});

systemMonitorClose.addEventListener('click', closeSystemMonitor);
systemMonitorRefresh.addEventListener('click', refreshSystemStats);
systemMonitor.querySelector('.monitor-backdrop').addEventListener('click', closeSystemMonitor);
portMonitorClose.addEventListener('click', closePortMonitor);
portMonitorRefresh.addEventListener('click', refreshPortStats);
portMonitor.querySelector('.monitor-backdrop').addEventListener('click', closePortMonitor);
chatController.bindChatEvents();
newsController.bindNewsEvents();
desktopCareController.bindDesktopCareEvents();

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
    if (isNewsOpen) closeNewsPanel();
    if (isTodoOpen) closeTodoList();
    if (isDesktopCareOpen) closeDesktopCare();
  }
});

settingsController.bindSettingsEvents();

reminderController.bindReminderEvents();

todoController.bindTodoEvents();
todoController.init();

translateController.bindTranslateEvents();

// --- Click interaction / effects ---
const SINGLE_CLICK_LINES = [() => newsController.nextHotNewsLine()];

function isUserInteracting() {
  return isDragging || isChatOpen || isThinking || isInteractionOverlayOpen();
}

let effectsController = null;

effectsController = window.RobotEffects.createEffectsController({
  petEl,
  container,
  snoozeBar,
  speechBubble,
  showSpeech,
  setMouseCapture,
  updateMouseCapture,
  render,
  isUserInteracting,
  setDoubleClickAnimating: (animating) => {
    isDblClickAnimating = animating;
  },
  getSingleClickLines: () => SINGLE_CLICK_LINES
});

function startIdleAnimations() {
  if (!effectsController) return;
  return effectsController.startIdleAnimations();
}

function stopIdleAnimations() {
  if (!effectsController) return;
  return effectsController.stopIdleAnimations();
}

function resumeIdleAnimationsIfAllowed() {
  if (!effectsController) return;
  return effectsController.resumeIdleAnimationsIfAllowed();
}

function testIdleAnimation(kind) {
  if (!effectsController) return;
  return effectsController.testIdleAnimation(kind);
}

if (effectsController) {
  effectsController.bindRobotClick();
}

// --- Init ---
reminderController.init();
container.style.left = window.innerWidth * 0.9 + 'px';
render();
if (window.THREE) {
  initRobot3D();
} else {
  window.addEventListener('three-ready', initRobot3D, { once: true });
}
reportRobotBounds();
initializeProtectedSecrets().catch((error) => {
  console.error('[settings] failed to protect stored API keys:', error);
  updateModelIndicator();
});
startIdleAnimations();
