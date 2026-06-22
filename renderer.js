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
const SPEECH_WRAP_THRESHOLD = 18;

const petEl = document.getElementById('pet');
const container = document.getElementById('pet-container');
const petStage = document.getElementById('pet-stage');
const petDepthLayers = Array.from(document.querySelectorAll('#pet-depth-stack .pet-depth-layer'));
const THREE = window.THREE;
const robot3DHost = document.getElementById('robot-3d-host');
const speechBubble = document.getElementById('speech-bubble');
const snoozeBar = document.getElementById('snooze-bar');
const snoozeSelect = document.getElementById('snooze-select');
const snoozeBtn = document.getElementById('snooze-btn');
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
let isDblClickAnimating = false;
let systemMonitorInterval = null;
let portMonitorInterval = null;
let systemStatsInFlight = false;
let portStatsInFlight = false;
let envConfig = { baseUrl: '', model: '', apiKey: '' };
let robot3D = null;
let robot3DResizeObserver = null;
let robot3DWindowResizeHandler = null;
let currentPetSrc = '';
let reminderController = null;
let settingsController = null;
let chatController = null;

function parseSettingsSafe() {
  return settingsController ? settingsController.parseSettingsSafe() : {};
}

window.electronAPI.getEnvConfig().then((cfg) => {
  envConfig = cfg || { baseUrl: '', model: '', apiKey: '' };
}).catch(() => {
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

  const dblEffect = ['dbl-glitch', 'dbl-stomp', 'dbl-disco'].find(c => petEl.classList.contains(c));
  const idleActionClass = ['yawn-yawn', 'yawn-stretch', 'yawn-rub-eyes'].find(c => petEl.classList.contains(c));
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
  snoozeBar.classList.add('hidden');
  if (reminderController) reminderController.clearCurrentAlert();
  speechBubble.textContent = text;
  speechBubble.classList.remove('hidden', 'wrap', 'news');
  speechBubble.classList.toggle('clickable', !!persistent);
  if (type === 'news') speechBubble.classList.add('news');
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

function resizeRobot3D() {
  if (!robot3D) return;
  const width = petStage.clientWidth || petEl.width || 64;
  const height = petStage.clientHeight || petEl.height || 64;
  robot3D.renderer.setSize(width, height, false);
  robot3D.camera.aspect = width / height;
  robot3D.camera.updateProjectionMatrix();
}

function setRobot3DTarget(nx, ny, lift) {
  if (!robot3D) return;
  robot3D.state.targetX = nx * 0.6;
  robot3D.state.targetY = -ny * 0.42;
  robot3D.state.targetZ = nx * 0.14;
  robot3D.state.targetLift = lift * 0.08;
}

function resetRobot3DTarget() {
  if (!robot3D) return;
  robot3D.state.targetX = 0;
  robot3D.state.targetY = 0;
  robot3D.state.targetZ = 0;
  robot3D.state.targetLift = 0;
}

function disposeRobot3D() {
  if (robot3DResizeObserver) {
    robot3DResizeObserver.disconnect();
    robot3DResizeObserver = null;
  }
  if (robot3DWindowResizeHandler) {
    window.removeEventListener('resize', robot3DWindowResizeHandler);
    robot3DWindowResizeHandler = null;
  }
  if (robot3D) {
    if (robot3D.animationId) {
      cancelAnimationFrame(robot3D.animationId);
      robot3D.animationId = null;
    }
    robot3D.renderer.dispose();
    robot3D = null;
  }
  container.classList.remove('robot-3d-ready');
}

function initRobot3D() {
  disposeRobot3D();
  if (!robot3DHost) return null;
  if (!THREE || typeof THREE.WebGLRenderer !== 'function') {
    console.warn('[robot-3d] THREE unavailable, fallback to 2D rendering.');
    return null;
  }

  let renderer = null;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  } catch (error) {
    console.warn('[robot-3d] WebGL unavailable, fallback to 2D rendering.', error);
    return null;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) {
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  } else if ('outputEncoding' in renderer && THREE.sRGBEncoding) {
    renderer.outputEncoding = THREE.sRGBEncoding;
  }
  renderer.domElement.className = 'robot-3d-canvas';
  robot3DHost.replaceChildren(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 0.15, 8);

  const rig = new THREE.Group();
  scene.add(rig);

  const ambient = new THREE.AmbientLight(0xffffff, 1.8);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
  keyLight.position.set(2.5, 3.5, 5);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x89d8ff, 0.9);
  fillLight.position.set(-2.5, 1.8, 3);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0x1f8fff, 0.65);
  rimLight.position.set(0, 1.5, -4);
  scene.add(rimLight);

  const textureLoader = new THREE.TextureLoader();
  const texture = textureLoader.load('assets/robot.svg', () => {
    resizeRobot3D();
  });
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;

  const shellMaterial = new THREE.MeshStandardMaterial({ color: 0xcfe2ea, roughness: 0.45, metalness: 0.08 });
  const sideMaterial = new THREE.MeshStandardMaterial({ color: 0xa3bcc9, roughness: 0.65, metalness: 0.06 });
  const backMaterial = new THREE.MeshStandardMaterial({ color: 0x7d97a4, roughness: 0.9, metalness: 0.02 });
  const frontMaterial = new THREE.MeshStandardMaterial({
    map: texture,
    transparent: true,
    roughness: 0.45,
    metalness: 0.12,
    emissive: 0x08131a,
    emissiveIntensity: 0.08
  });

  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(2.85, 3.25, 1.05),
    [sideMaterial, sideMaterial, shellMaterial, sideMaterial, shellMaterial, backMaterial]
  );
  shell.position.y = -0.05;
  rig.add(shell);

  const front = new THREE.Mesh(new THREE.PlaneGeometry(2.95, 3.35), frontMaterial);
  front.position.z = 0.545;
  front.position.y = -0.05;
  rig.add(front);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.55, 40),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.24 })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, -1.88, -0.65);
  rig.add(shadow);

  robot3D = {
    renderer,
    scene,
    camera,
    rig,
    shadow,
    animationId: null,
    state: {
      targetX: 0,
      targetY: 0,
      targetZ: 0,
      targetLift: 0,
      currentX: 0,
      currentY: 0,
      currentZ: 0,
      currentLift: 0
    }
  };

  resizeRobot3D();
  container.classList.add('robot-3d-ready');

  if (typeof ResizeObserver === 'function') {
    robot3DResizeObserver = new ResizeObserver(() => {
      if (robot3D) resizeRobot3D();
    });
    robot3DResizeObserver.observe(robot3DHost);
  } else {
    robot3DWindowResizeHandler = () => {
      if (robot3D) resizeRobot3D();
    };
    window.addEventListener('resize', robot3DWindowResizeHandler);
  }

  const animate = (timestamp) => {
    if (!robot3D) return;
    const state = robot3D.state;
    state.currentX += (state.targetX - state.currentX) * 0.08;
    state.currentY += (state.targetY - state.currentY) * 0.08;
    state.currentZ += (state.targetZ - state.currentZ) * 0.08;
    state.currentLift += (state.targetLift - state.currentLift) * 0.08;

    robot3D.rig.rotation.y = state.currentX;
    robot3D.rig.rotation.x = state.currentY;
    robot3D.rig.rotation.z = state.currentZ;
    robot3D.rig.position.y = state.currentLift + Math.sin(timestamp * 0.0016) * 0.05;
    robot3D.shadow.scale.setScalar(1 - Math.min(0.28, Math.abs(state.currentX) * 0.35 + Math.abs(state.currentY) * 0.25));

    robot3D.renderer.render(robot3D.scene, robot3D.camera);
    robot3D.animationId = requestAnimationFrame(animate);
  };

  robot3D.animationId = requestAnimationFrame(animate);
  return robot3D;
}

settingsController = window.RobotSettings.createSettingsController({
  elements: {
    settingsModal,
    settingPetName,
    settingSystemPrompt,
    settingAutoWebFallback,
    settingWebSearchTopK,
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

// --- Chat ---
chatController = window.RobotChat.createChatController({
  elements: {
    chatPanel,
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
  panelEl.querySelectorAll('.monitor-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  panelEl.querySelectorAll('.monitor-tab-content').forEach(el => {
    el.classList.toggle('active', el.id === 'tab-' + tabName);
  });
}

// --- System Monitor ---
async function refreshSystemStats() {
  if (systemStatsInFlight) return;
  systemStatsInFlight = true;
  let stats;
  try {
    stats = await window.electronAPI.getSystemStats();
  } finally {
    systemStatsInFlight = false;
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
  resumeIdleAnimationsIfAllowed();
  updateMouseCapture();
}

systemMonitor.querySelectorAll('.monitor-tab').forEach(btn => {
  btn.addEventListener('click', () => switchTab(systemMonitor, btn.dataset.tab));
});

// --- Port Monitor ---
async function refreshPortStats() {
  if (portStatsInFlight) return;
  portStatsInFlight = true;
  let data;
  try {
    data = await window.electronAPI.getPortStats();
  } finally {
    portStatsInFlight = false;
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
  resumeIdleAnimationsIfAllowed();
  updateMouseCapture();
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

function updateMouseCapture() {
  const shouldCapture = isDragging ||
    isSettingsOpen ||
    isMonitorOpen ||
    isReminderOpen ||
    isChatOpen ||
    isDblClickAnimating ||
    !snoozeBar.classList.contains('hidden') ||
    !speechBubble.classList.contains('hidden');
  setMouseCapture(shouldCapture);
}

let pendingMouseMove = null;
let mouseMoveFrame = null;

function handleRobotMouseMove(clientX, clientY) {
  if (isDragging) {
    resetPetPerspective();
    return;
  }
  if (isSettingsOpen || isMonitorOpen || isReminderOpen || isChatOpen || isDblClickAnimating || !snoozeBar.classList.contains('hidden') || !speechBubble.classList.contains('hidden')) {
    resetPetPerspective();
    return;
  }
  const rect = container.getBoundingClientRect();
  const pad = 20;
  const overContainer = clientX >= rect.left - pad && clientX <= rect.right + pad && clientY >= rect.top - pad && clientY <= rect.bottom + pad;
  const el = document.elementFromPoint(clientX, clientY);
  const overChatPanel = !!(el && el.closest('#chat-panel'));
  const overReminderCenter = !!(el && el.closest('#reminder-center'));
  // Use bounding rect for speech bubble since it overflows the container (top: -50px)
  const sbRect = speechBubble.getBoundingClientRect();
  const overSpeechBubble = !speechBubble.classList.contains('hidden') &&
    clientX >= sbRect.left && clientX <= sbRect.right &&
    clientY >= sbRect.top && clientY <= sbRect.bottom;
  if (overContainer) updatePetPerspective(clientX, clientY);
  else resetPetPerspective();
  setMouseCapture(overContainer || overChatPanel || overReminderCenter || overSpeechBubble);
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
  } else if (action === 'test-idle-yawn') {
    testIdleAnimation('yawn');
  } else if (action === 'test-idle-stretch') {
    testIdleAnimation('stretch');
  } else if (action === 'test-idle-rub-eyes') {
    testIdleAnimation('rub-eyes');
  }
});

systemMonitorClose.addEventListener('click', closeSystemMonitor);
systemMonitor.querySelector('.monitor-backdrop').addEventListener('click', closeSystemMonitor);
portMonitorClose.addEventListener('click', closePortMonitor);
portMonitor.querySelector('.monitor-backdrop').addEventListener('click', closePortMonitor);

chatController.bindChatEvents();

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

settingsController.bindSettingsEvents();

reminderController.bindReminderEvents();

function containsChinese(text) {
  return /[\u4e00-\u9fff]/.test(text || '');
}

function needsChineseExplainRepair(inputText, outputText) {
  if (!containsChinese(inputText)) return false;
  const out = (outputText || '').trim();
  if (!out) return true;
  const tonePinyinPattern = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/;
  const compactChinesePattern = /（[^）]+）：.+/;
  return !(compactChinesePattern.test(out) && tonePinyinPattern.test(out));
}

function formatEnglishTranslationResult(inputText, outputText) {
  const source = (inputText || '').trim();
  if (!source) return (outputText || '').trim();

  let out = (outputText || '').replace(/\s+/g, ' ').trim();
  if (!out) return `${source}：`;

  out = out.replace(/^["“”'`]+|["“”'`]+$/g, '');
  out = out.replace(/^(翻译|译文|中文翻译|结果)\s*[：:]\s*/i, '');

  const pair = out.match(/^(.+?)[：:]\s*(.+)$/);
  if (pair) {
    const left = pair[1].trim();
    const right = pair[2].trim();
    if (left.toLowerCase() === source.toLowerCase() || /^[A-Za-z0-9 _./-]+$/.test(left)) {
      out = right;
    }
  }

  return `${source}：${out}`;
}

async function handleTranslateSelection(text) {
  if (!text) {
    showSpeech('请先 Cmd+C 复制文字', 2500);
    return;
  }

  const translateConfig = getTranslateModelConfig();
  if (!translateConfig || !translateConfig.baseUrl || !translateConfig.model || !translateConfig.apiKey) {
    showSpeech('请先配置翻译模型', 2000);
    return;
  }

  showSpeech('翻译中…', 0);

  const prompt = `你是一个精准的翻译助手。请对以下文字进行处理：
- 如果是英文或其他外语，严格输出：英文原词：中文翻译
- 如果是中文，严格输出：中文词（带声调拼音）：中文解释

输出要求：
- 只输出一行结果，不要额外说明
- 中文场景必须同时包含拼音和解释，拼音放在全角括号中并带声调（如 cèshì）
- 统一使用中文冒号“：”

英文示例：min：最小
中文示例：测试（cèshì）：用于验证功能是否正常

原文："""${text}"""`;

  try {
    const result = await window.electronAPI.chat({
      baseUrl: translateConfig.baseUrl,
      model: translateConfig.model,
      apiKey: translateConfig.apiKey,
      provider: translateConfig.provider,
      messages: [{ role: 'user', content: prompt }]
    });

    if (result.success) {
      let reply = result.content;
      if (needsChineseExplainRepair(text, reply)) {
        const repairPrompt = `你上一条输出格式不符合要求。请仅按以下格式重写，不要添加其他内容：
中文词（带声调拼音）：中文解释

要求：
- 使用中文冒号“：”
- 拼音必须带声调（如 cèshì）

原文："""${text}"""
你上一条输出："""${reply}"""`;
        const repaired = await window.electronAPI.chat({
          baseUrl: translateConfig.baseUrl,
          model: translateConfig.model,
          apiKey: translateConfig.apiKey,
          provider: translateConfig.provider,
          messages: [{ role: 'user', content: repairPrompt }]
        });
        if (repaired.success && repaired.content) {
          reply = repaired.content;
        }
      }
      if (!containsChinese(text)) {
        reply = formatEnglishTranslationResult(text, reply);
      }
      const preview = reply.replace(/\n+/g, ' ');
      showSpeech(preview, 10000);
      appendTranslateMessage(reply);
    } else {
      showSpeech('翻译失败', 2000);
    }
  } catch (e) {
    showSpeech('翻译出错', 2000);
  }
}

function appendTranslateMessage(content) {
  chatController.appendTranslateMessage(content);
}

window.electronAPI.onTranslateSelection(handleTranslateSelection);

// --- Click interaction ---
const SINGLE_CLICK_LINES = [
  async () => {
    try {
      const res = await window.electronAPI.getHotNews(30);
      if (!res.success || !res.headlines || res.headlines.length === 0) return '新闻获取失败，下次再试吧~';
      const pick = res.headlines[Math.floor(Math.random() * res.headlines.length)];
      const idx = res.headlines.indexOf(pick) + 1;
      return { text: `📰 ${pick}`, duration: 6000, type: 'news' };
    } catch { return '新闻获取失败，下次再试吧~'; }
  },
];

const DOUBLE_CLICK_LINES = [
  () => '（转圈圈）主人！我最喜欢你了！♥',
  () => '（发射爱心光线）主人你是最棒的！',
  () => '（害羞地捂脸）人家才不是特别喜欢你呢……才不是……',
  () => '（兴奋地跳起来）主人终于来陪我玩了！！',
  () => {
    const h = new Date().getHours();
    if (h < 6) return '（揉眼睛）主人还没睡吗……心疼你……';
    if (h < 12) return '（元气满满）早上好！今天也要加油哦！☀';
    if (h < 14) return '（摸摸肚子）主人吃过午饭了吗？别饿着！';
    if (h < 18) return '（伸懒腰）下午了呢，要不要休息一下？';
    if (h < 22) return '（靠过来）晚上陪主人加班，我最强！';
    return '（打哈欠）主人该睡觉啦，熬夜对身体不好哦~';
  },
  async () => {
    const stats = await window.electronAPI.getSystemStats().catch(() => null);
    if (!stats || stats.error) return '（竖起天线）系统一切正常！嗯……大概吧。';
    const cpu = parseInt(stats.cpu);
    if (cpu > 80) return `（冒烟）CPU ${stats.cpu}！！主人快关几个程序吧，我要热化了！🔥`;
    if (cpu > 50) return `（擦汗）CPU ${stats.cpu}，还行还行，我还能撑住！`;
    return `（得意）CPU 才 ${stats.cpu}，多亏我帮你监控着呢~`;
  },
  () => {
    const moods = ['超开心', '有点小激动', '感动得不行', '幸福到冒泡', '开心到原地起飞'];
    const actions = ['转圈圈', '蹦蹦跳跳', '挥舞小手', '闪亮登场', '撒花花'];
    return `（${actions[Math.floor(Math.random() * actions.length)]}）主人连点我！我${moods[Math.floor(Math.random() * moods.length)]}！♥`;
  },
  () => {
    const picks = [
      '主人是不是想我了？我一直在哦！',
      '双击！这是爱的信号对吧！对吧！',
      '（脸红）主人不要一直戳我啦……虽然也不讨厌……',
      '收到主人的双倍爱意！电量充满！⚡',
      '嘿嘿，被主人关注的感觉真好~',
    ];
    return picks[Math.floor(Math.random() * picks.length)];
  },
  () => '（踩着节拍）双击收到！开始跳舞模式！🎵',
];
const DOUBLE_CLICK_WINDOW_MS = 450;
const DOUBLE_CLICK_EFFECTS = [
  { className: 'dbl-glitch', durationMs: 920, particles: 'sparkles', glowColor: 'rgba(34,211,238,0.65)' },
  { className: 'dbl-stomp',  durationMs: 1050, particles: 'mixed',   glowColor: 'rgba(251,146,60,0.62)', impact: true },
  { className: 'dbl-disco',  durationMs: 1200, particles: 'music',   glowColor: 'rgba(168,85,247,0.68)' },
];
let doubleClickEffectIndex = 0;

const YAWN_ACTIONS = [
  {
    key: 'yawn',
    className: 'yawn-yawn',
    containerClass: 'idle-yawning',
    durationMs: 1100,
    line: '（打哈欠）好困……'
  },
  {
    key: 'stretch',
    className: 'yawn-stretch',
    containerClass: 'idle-stretching',
    durationMs: 1500,
    line: '（伸懒腰）啊——好舒服~'
  },
  {
    key: 'rub-eyes',
    className: 'yawn-rub-eyes',
    containerClass: 'idle-rubbing',
    durationMs: 1200,
    line: '（揉眼睛）有点想睡觉了……'
  },
];

let clickCount = 0;
let clickTimer = null;

window.electronAPI.onRobotClick(() => {
  // Ignore global hit-test clicks while interacting with reminder snooze controls.
  if (!snoozeBar.classList.contains('hidden')) return;
  clickCount++;
  console.log('[click] robot-click, clickCount=', clickCount);

  // If news bubble is showing, refresh immediately
  if (!speechBubble.classList.contains('hidden') && speechBubble.classList.contains('news')) {
    clickCount = 0;
    clearTimeout(clickTimer);
    (async () => {
      const fn = SINGLE_CLICK_LINES[0];
      const result = await fn();
      if (result && typeof result === 'object' && result.text) {
        showSpeech(result.text, result.duration || 3500, false, result.type);
      } else {
        showSpeech(result, 3500);
      }
    })();
    return;
  }

  clearTimeout(clickTimer);
  clickTimer = setTimeout(async () => {
    const count = clickCount;
    clickCount = 0;
    console.log('[click] timer fired, count=', count);

    if (count === 1) {
      const fn = SINGLE_CLICK_LINES[Math.floor(Math.random() * SINGLE_CLICK_LINES.length)];
      const result = await fn();
      if (result && typeof result === 'object' && result.text) {
        showSpeech(result.text, result.duration || 3500, false, result.type);
      } else {
        showSpeech(result, 3500);
      }
    } else if (count >= 2) {
      const lineFn = DOUBLE_CLICK_LINES[Math.floor(Math.random() * DOUBLE_CLICK_LINES.length)];
      const line = await lineFn();
      const effect = DOUBLE_CLICK_EFFECTS[doubleClickEffectIndex];
      doubleClickEffectIndex = (doubleClickEffectIndex + 1) % DOUBLE_CLICK_EFFECTS.length;
      showSpeech(line, 4000);
      petEl.classList.remove('idle');
      petEl.classList.add(effect.className);
      isDblClickAnimating = true;
      setMouseCapture(true);

      // Screen shake
      container.classList.add('shake');
      setTimeout(() => container.classList.remove('shake'), 500);

      // Glow ring
      spawnGlowRing(effect.glowColor);

      // Particles
      if (effect.particles === 'hearts') spawnHearts(7);
      else if (effect.particles === 'sparkles') spawnSparkles(10);
      else if (effect.particles === 'music') spawnMusicNotes(9);
      else if (effect.particles === 'mixed') { spawnHearts(4); spawnSparkles(6); }

      // Impact ring for bounce
      if (effect.impact) {
        setTimeout(() => spawnImpactRing(), 520);
      }

      setTimeout(() => {
        petEl.classList.remove(effect.className);
        petEl.style.removeProperty('filter');
        isDblClickAnimating = false;
        render();
        updateMouseCapture();
      }, effect.durationMs);
    }
  }, DOUBLE_CLICK_WINDOW_MS);
});

function spawnHearts(count = 5) {
  for (let i = 0; i < count; i++) {
    const heart = document.createElement('div');
    heart.className = 'floating-heart';
    heart.textContent = ['♥', '♡', '❤'][Math.floor(Math.random() * 3)];
    const offsetX = (Math.random() - 0.5) * 80;
    heart.style.setProperty('--hx', offsetX + 'px');
    heart.style.left = '50%';
    heart.style.bottom = '70px';
    heart.style.animationDelay = (i * 0.08) + 's';
    heart.style.fontSize = (14 + Math.random() * 10) + 'px';
    container.appendChild(heart);
    heart.addEventListener('animationend', () => heart.remove(), { once: true });
  }
}

function spawnSparkles(count = 10) {
  const chars = ['✦', '✧', '⋆', '★', '✶', '✸'];
  const colors = ['#FFD700', '#FF69B4', '#00E5FF', '#FF6B6B', '#A78BFA', '#34D399'];
  for (let i = 0; i < count; i++) {
    const spark = document.createElement('div');
    spark.className = 'sparkle-particle';
    spark.textContent = chars[Math.floor(Math.random() * chars.length)];
    spark.style.color = colors[Math.floor(Math.random() * colors.length)];
    spark.style.fontSize = (8 + Math.random() * 14) + 'px';
    spark.style.left = '50%';
    spark.style.bottom = '50px';

    const angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.5;
    const dist = 30 + Math.random() * 40;
    const tx = Math.cos(angle) * dist;
    const ty = Math.sin(angle) * dist;
    const tx2 = tx * 1.5;
    const ty2 = ty - 20;
    spark.style.setProperty('--tx', tx + 'px');
    spark.style.setProperty('--ty', ty + 'px');
    spark.style.setProperty('--tx2', tx2 + 'px');
    spark.style.setProperty('--ty2', ty2 + 'px');
    spark.style.setProperty('--dur', (0.5 + Math.random() * 0.4) + 's');
    spark.style.animationDelay = (i * 0.03) + 's';
    spark.style.textShadow = `0 0 6px ${spark.style.color}`;

    container.appendChild(spark);
    spark.addEventListener('animationend', () => spark.remove(), { once: true });
  }
}

function spawnMusicNotes(count = 8) {
  const notes = ['♪', '♫', '♩', '♬'];
  const colors = ['#8B5CF6', '#EC4899', '#22D3EE', '#F59E0B', '#34D399'];
  for (let i = 0; i < count; i++) {
    const note = document.createElement('div');
    note.className = 'music-note-particle';
    note.textContent = notes[Math.floor(Math.random() * notes.length)];
    note.style.color = colors[Math.floor(Math.random() * colors.length)];
    note.style.fontSize = (16 + Math.random() * 10) + 'px';
    note.style.left = '50%';
    note.style.bottom = '52px';
    note.style.animationDelay = (i * 0.04) + 's';
    note.style.setProperty('--note-x', ((Math.random() - 0.5) * 120) + 'px');
    note.style.setProperty('--note-top', (70 + Math.random() * 60) + 'px');
    note.style.textShadow = `0 0 8px ${note.style.color}`;
    container.appendChild(note);
    note.addEventListener('animationend', () => note.remove(), { once: true });
  }
}

function spawnGlowRing(color = 'rgba(255,77,121,0.6)') {
  const ring = document.createElement('div');
  ring.className = 'glow-ring';
  ring.style.setProperty('--glow-color', color);
  container.appendChild(ring);
  ring.addEventListener('animationend', () => ring.remove(), { once: true });
}

function spawnImpactRing() {
  const ring = document.createElement('div');
  ring.className = 'impact-ring';
  container.appendChild(ring);
  ring.addEventListener('animationend', () => ring.remove(), { once: true });
}

// --- Idle animations (yawn) ---
let isIdleAnimating = false;
let idleYawnTimer = null;

function isUserInteracting() {
  return isDragging || isChatOpen || isSettingsOpen || isMonitorOpen ||
    isReminderOpen || isDblClickAnimating || isThinking ||
    !snoozeBar.classList.contains('hidden') ||
    !speechBubble.classList.contains('hidden');
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function triggerYawn(actionKey = null, force = false) {
  if (isIdleAnimating || (!force && isUserInteracting())) return;
  isIdleAnimating = true;

  const action = actionKey
    ? YAWN_ACTIONS.find(a => a.key === actionKey)
    : YAWN_ACTIONS[Math.floor(Math.random() * YAWN_ACTIONS.length)];
  const chosen = action || YAWN_ACTIONS[0];
  showSpeech(chosen.line, chosen.durationMs + 1200);

  container.classList.add(chosen.containerClass);
  petEl.classList.remove('idle');
  petEl.classList.add(chosen.className);
  petEl.addEventListener('animationend', function onYawnEnd() {
    petEl.removeEventListener('animationend', onYawnEnd);
    petEl.classList.remove(chosen.className);
    container.classList.remove(chosen.containerClass);
    render();
    isIdleAnimating = false;
  });
}

function scheduleYawn() {
  stopYawn();
  const delay = randomBetween(3 * 60 * 1000, 8 * 60 * 1000);
  idleYawnTimer = setTimeout(() => {
    triggerYawn();
    scheduleYawn();
  }, delay);
}

function stopYawn() {
  if (idleYawnTimer) { clearTimeout(idleYawnTimer); idleYawnTimer = null; }
}

function clearIdleActionClasses() {
  petEl.classList.remove('yawn-yawn', 'yawn-stretch', 'yawn-rub-eyes');
  container.classList.remove('idle-yawning', 'idle-stretching', 'idle-rubbing');
}

function startIdleAnimations() {
  scheduleYawn();
}

function stopIdleAnimations() {
  stopYawn();
}

function resumeIdleAnimationsIfAllowed() {
  if (!isUserInteracting()) startIdleAnimations();
}

function testIdleAnimation(kind) {
  stopIdleAnimations();
  isIdleAnimating = false;
  clearIdleActionClasses();
  if (kind === 'yawn') {
    triggerYawn('yawn', true);
  } else if (kind === 'stretch') {
    triggerYawn('stretch', true);
  } else if (kind === 'rub-eyes') {
    triggerYawn('rub-eyes', true);
  }
}

// --- Init ---
reminderController.init();
container.style.left = (window.innerWidth * 0.90) + 'px';
render();
initRobot3D();
reportRobotBounds();
initializeProtectedSecrets().catch((error) => {
  console.error('[settings] failed to protect stored API keys:', error);
  updateModelIndicator();
});
startIdleAnimations();
