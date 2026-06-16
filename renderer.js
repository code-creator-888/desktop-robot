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
let countdownInterval = null;
let chatMessagesList = [];
let currentSessionId = null;
let envConfig = { baseUrl: '', model: '', apiKey: '' };
let reminderItems = [];
let editingReminderId = null;
let robot3D = null;
let robot3DResizeObserver = null;
let robot3DWindowResizeHandler = null;
let currentPetSrc = '';

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
  return `你是用户的桌面机器人，一只${name}。你性格${personality.personality}。
请用简短、可爱、口语化的中文回复，每次回复不超过50个字。
保持你的机器人设，可以偶尔加上动作描述（用括号包裹，如"（摇尾巴）"）。
用户是你的主人，请亲切地称呼用户为"主人"。`;
}

function render() {
  const pet = getPet();

  petEl.src = pet.src;
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

  const dblEffect = ['dbl-spin', 'dbl-rocket', 'dbl-jelly'].find(c => petEl.classList.contains(c));
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
  currentAlertItem = null;
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
function updateTranslateSettingsVisibility() {
  const isCustom = settingTranslateModelMode.value === 'custom';
  settingTranslateCustom.classList.toggle('hidden', !isCustom);
}

function loadSettings() {
  const saved = localStorage.getItem('aiSettings');
  const settings = saved ? JSON.parse(saved) : {};
  const autoWebFallback = settings.autoWebFallback !== false;
  const webSearchTopK = clampWebSearchTopK(settings.webSearchTopK);
  const translateModelMode = settings.translateModelMode === 'custom' ? 'custom' : 'same';

  if (saved) {
    settingPetName.value = settings.petName || '';
    settingSystemPrompt.value = settings.systemPrompt || '';
  } else {
    settingPetName.value = '';
    settingSystemPrompt.value = '';
  }

  settingAutoWebFallback.checked = autoWebFallback;
  settingWebSearchTopK.value = String(webSearchTopK);
  settingTranslateModelMode.value = translateModelMode;
  settingTranslateBaseUrl.value = settings.translateBaseUrl || '';
  settingTranslateModel.value = settings.translateModel || '';
  settingTranslateApiKey.value = settings.translateApiKey || '';
  updateTranslateSettingsVisibility();
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
    webSearchTopK: clampWebSearchTopK(settingWebSearchTopK.value),
    translateModelMode: settingTranslateModelMode.value === 'custom' ? 'custom' : 'same',
    translateBaseUrl: settingTranslateBaseUrl.value.trim(),
    translateModel: settingTranslateModel.value.trim(),
    translateApiKey: settingTranslateApiKey.value.trim()
  };
  localStorage.setItem('aiSettings', JSON.stringify(settings));
  closeSettings();
}

function getTranslateModelConfig() {
  const saved = localStorage.getItem('aiSettings');
  const settings = saved ? JSON.parse(saved) : {};
  const mode = settings.translateModelMode === 'custom' ? 'custom' : 'same';
  if (mode === 'same') return getSettings();

  const baseUrl = (settings.translateBaseUrl || '').trim();
  const model = (settings.translateModel || '').trim();
  const apiKey = (settings.translateApiKey || '').trim();
  if (!baseUrl || !model || !apiKey) return null;
  return {
    baseUrl,
    model,
    apiKey,
    provider: 'openai'
  };
}

function openSettings() {
  isSettingsOpen = true;
  stopIdleAnimations();
  loadSettings();
  settingsModal.classList.remove('hidden');
  setMouseCapture(true);
}

function closeSettings() {
  isSettingsOpen = false;
  settingsModal.classList.add('hidden');
  resumeIdleAnimationsIfAllowed();
  updateMouseCapture();
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

function isoToLocalInput(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function formatReminderRule(type) {
  if (type === 'daily') return '每天';
  if (type === 'weekly') return '每周';
  if (type === 'workday') return '工作日';
  return '仅一次';
}

function formatCountdown(ms) {
  if (ms <= 0) return '已到时间';
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return d + '天 ' + h + '小时';
  if (h > 0) return h + '小时 ' + m + '分';
  if (m > 0) return m + '分 ' + s + '秒';
  return s + '秒';
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
    const isEditing = item.id === editingReminderId;

    const row = document.createElement('div');
    row.className = 'reminder-item' + (item.status === 'done' ? ' done' : '') + (isEditing ? ' editing' : '');

    if (isEditing) {
      const localTime = isoToLocalInput(item.nextTriggerAt || item.dueAt);
      row.innerHTML = `
        <div class="reminder-edit-form">
          <input type="text" class="reminder-edit-title" value="${item.title}" maxlength="60">
          <input type="datetime-local" class="reminder-edit-time" value="${localTime}">
          <select class="reminder-edit-rule">
            <option value="one-time"${ruleType === 'one-time' ? ' selected' : ''}>仅一次</option>
            <option value="daily"${ruleType === 'daily' ? ' selected' : ''}>每天</option>
            <option value="weekly"${ruleType === 'weekly' ? ' selected' : ''}>每周</option>
            <option value="workday"${ruleType === 'workday' ? ' selected' : ''}>工作日</option>
          </select>
        </div>
        <div class="reminder-item-actions">
          <button class="reminder-save-btn" data-id="${item.id}">保存</button>
          <button class="reminder-cancel-btn" data-id="${item.id}">取消</button>
        </div>
      `;
    } else {
      const triggerTs = new Date(item.nextTriggerAt || item.dueAt).getTime();
      row.innerHTML = `
        <div class="reminder-item-main">
          <div class="reminder-item-title">${item.title}</div>
          <div class="reminder-item-meta">${formatReminderTime(item.nextTriggerAt || item.dueAt)} · ${formatReminderRule(ruleType)}</div>
          ${item.status !== 'done' ? `<div class="reminder-countdown" data-trigger-ts="${triggerTs}"></div>` : ''}
        </div>
        <div class="reminder-item-actions">
          <button class="reminder-edit-btn" data-id="${item.id}">编辑</button>
          <button class="reminder-done-btn" data-id="${item.id}">完成</button>
          <button class="reminder-delete-btn" data-id="${item.id}">删除</button>
        </div>
      `;
    }
    reminderListEl.appendChild(row);
  });

  reminderListEl.querySelectorAll('.reminder-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      editingReminderId = btn.dataset.id;
      stopCountdown();
      renderReminderList();
    });
  });

  reminderListEl.querySelectorAll('.reminder-save-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const item = reminderItems.find(x => x.id === id);
      if (!item) return;
      const row = btn.closest('.reminder-item');
      const title = row.querySelector('.reminder-edit-title').value.trim();
      const timeRaw = row.querySelector('.reminder-edit-time').value;
      const ruleVal = row.querySelector('.reminder-edit-rule').value;
      if (!title || !timeRaw) return;
      const dueAt = new Date(timeRaw).toISOString();
      item.title = title;
      item.dueAt = dueAt;
      item.nextTriggerAt = dueAt;
      item.rule = { type: ['one-time', 'daily', 'weekly', 'workday'].includes(ruleVal) ? ruleVal : 'one-time' };
      item.status = 'pending';
      item.lastNotifiedAt = 0;
      editingReminderId = null;
      saveReminderItems();
      renderReminderList();
    });
  });

  reminderListEl.querySelectorAll('.reminder-cancel-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      editingReminderId = null;
      renderReminderList();
    });
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

  if (isReminderOpen) startCountdown();
}

function updateReminderCountdowns() {
  if (!reminderListEl) return;
  const now = Date.now();
  reminderListEl.querySelectorAll('.reminder-countdown').forEach((el) => {
    const ts = Number(el.dataset.triggerTs);
    if (!ts || Number.isNaN(ts)) { el.textContent = ''; return; }
    const remaining = ts - now;
    el.textContent = '⏳ ' + formatCountdown(remaining);
    el.classList.toggle('countdown-urgent', remaining > 0 && remaining <= 60000);
  });
}

function startCountdown() {
  stopCountdown();
  updateReminderCountdowns();
  countdownInterval = setInterval(updateReminderCountdowns, 1000);
}

function stopCountdown() {
  if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
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

let currentAlertItem = null;

function triggerReminderAlert(item) {
  showSpeech(`提醒：${item.title}`, 0, true);
  currentAlertItem = item;
  snoozeBar.classList.remove('hidden');
  setMouseCapture(true);
  reportRobotBounds();
  setTimeout(() => {
    speechBubble.classList.add('reminder-alert');
    setTimeout(() => speechBubble.classList.remove('reminder-alert'), 3600);
  }, 300);

  petEl.classList.remove('idle');
  petEl.classList.add('bounce');
  petEl.addEventListener('animationend', function onBounceEnd() {
    petEl.removeEventListener('animationend', onBounceEnd);
    petEl.classList.remove('bounce');
    setTimeout(() => {
      petEl.classList.add('bounce');
      petEl.addEventListener('animationend', function onBounce2() {
        petEl.removeEventListener('animationend', onBounce2);
        petEl.classList.remove('bounce');
        petEl.classList.add('idle');
      });
    }, 150);
  });

  petEl.classList.add('attention-wiggle');
  setTimeout(() => petEl.classList.remove('attention-wiggle'), 1600);
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
    triggerReminderAlert(item);
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
  stopIdleAnimations();
  reminderCenter.classList.remove('hidden');
  setMouseCapture(true);
  renderReminderList();
  startCountdown();
}

function closeReminderCenter() {
  isReminderOpen = false;
  stopCountdown();
  reminderCenter.classList.add('hidden');
  resumeIdleAnimationsIfAllowed();
  updateMouseCapture();
}

// --- Chat ---
function openChat() {
  isChatOpen = true;
  stopIdleAnimations();
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
  resumeIdleAnimationsIfAllowed();
  updateMouseCapture();
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
    (!speechBubble.classList.contains('hidden') && speechBubble.classList.contains('clickable'));
  setMouseCapture(shouldCapture);
}

document.addEventListener('mousemove', (e) => {
  if (isDragging) {
    resetPetPerspective();
    return;
  }
  if (isSettingsOpen || isMonitorOpen || isReminderOpen || isDblClickAnimating || !snoozeBar.classList.contains('hidden') || (!speechBubble.classList.contains('hidden') && speechBubble.classList.contains('clickable'))) {
    resetPetPerspective();
    return;
  }
  const rect = container.getBoundingClientRect();
  const pad = 20;
  const overContainer = e.clientX >= rect.left - pad && e.clientX <= rect.right + pad && e.clientY >= rect.top - pad && e.clientY <= rect.bottom + pad;
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const overChatPanel = !!(el && el.closest('#chat-panel'));
  const overReminderCenter = !!(el && el.closest('#reminder-center'));
  if (overContainer) updatePetPerspective(e.clientX, e.clientY);
  else resetPetPerspective();
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
settingTranslateModelMode.addEventListener('change', updateTranslateSettingsVisibility);
settingsModal.querySelector('.settings-backdrop').addEventListener('click', closeSettings);
reminderCenterClose.addEventListener('click', closeReminderCenter);
reminderCenter.querySelector('.monitor-backdrop').addEventListener('click', closeReminderCenter);
reminderAddBtn.addEventListener('click', addManualReminder);
reminderAddTime.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addManualReminder();
});
speechBubble.addEventListener('mousedown', (e) => {
  e.stopPropagation();
});
speechBubble.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!speechBubble.classList.contains('clickable') && !speechBubble.classList.contains('news')) return;
  speechBubble.classList.add('hidden');
  speechBubble.classList.remove('clickable', 'news');
  snoozeBar.classList.add('hidden');
  currentAlertItem = null;
  reportRobotBounds();
  clearTimeout(speechTimeout);
  updateMouseCapture();
});

function doSnooze() {
  const mins = Number.parseInt(snoozeSelect.value, 10);
  const validMins = Number.isFinite(mins) && mins > 0 ? mins : 5;
  if (!currentAlertItem) {
    snoozeBar.classList.add('hidden');
    reportRobotBounds();
    updateMouseCapture();
    return;
  }
  currentAlertItem.lastNotifiedAt = Date.now();
  currentAlertItem.nextTriggerAt = new Date(Date.now() + validMins * 60 * 1000).toISOString();
  currentAlertItem.status = 'pending';
  saveReminderItems();
  speechBubble.classList.add('hidden');
  speechBubble.classList.remove('clickable', 'news', 'reminder-alert');
  snoozeBar.classList.add('hidden');
  currentAlertItem = null;
  reportRobotBounds();
  updateMouseCapture();
}

snoozeBar.addEventListener('mousedown', (e) => {
  e.stopPropagation();
});
snoozeBar.addEventListener('click', (e) => {
  e.stopPropagation();
});
snoozeBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  doSnooze();
});
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
  const div = document.createElement('div');
  div.className = 'chat-message translate-msg';
  div.textContent = content;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
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
    if (cpu > 80) return `（冒烟）CPU ${stats.cpu}%！！主人快关几个程序吧，我要热化了！🔥`;
    if (cpu > 50) return `（擦汗）CPU ${stats.cpu}%，还行还行，我还能撑住！`;
    return `（得意）CPU 才 ${stats.cpu}%，多亏我帮你监控着呢~`;
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
];
const DOUBLE_CLICK_WINDOW_MS = 450;
const DOUBLE_CLICK_EFFECTS = [
  { className: 'dbl-spin',   durationMs: 900, particles: 'hearts',  glowColor: 'rgba(255,77,121,0.6)' },
  { className: 'dbl-rocket', durationMs: 1000, particles: 'sparkles', glowColor: 'rgba(255,215,0,0.6)', impact: true },
  { className: 'dbl-jelly',  durationMs: 850, particles: 'mixed',   glowColor: 'rgba(100,200,255,0.6)' },
];

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
      const effect = DOUBLE_CLICK_EFFECTS[Math.floor(Math.random() * DOUBLE_CLICK_EFFECTS.length)];
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
reminderItems = loadReminderItems();
checkDueReminders();
setInterval(checkDueReminders, 30000);
container.style.left = (window.innerWidth * 0.90) + 'px';
render();
initRobot3D();
reportRobotBounds();
updateModelIndicator();
startIdleAnimations();
