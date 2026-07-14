(function () {
  const MODEL_CONFIGS_KEY = 'modelConfigs';
  const SECRET_PREFIXES = ['safe:v1:', 'plain:v1:'];

  function createSettingsController(deps) {
    const {
      elements,
      stopIdleAnimations,
      resumeIdleAnimationsIfAllowed,
      setMouseCapture,
      updateMouseCapture,
      setSettingsOpen
    } = deps;
    const {
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
    } = elements;

    let editingModelId = null;

    function parseSettingsSafe() {
      const saved = localStorage.getItem('aiSettings');
      if (!saved) return {};
      try {
        const parsed = JSON.parse(saved);
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch {
        return {};
      }
    }

    function isProtectedSecretValue(value) {
      return typeof value === 'string' && SECRET_PREFIXES.some(prefix => value.startsWith(prefix));
    }

    async function protectSecretValue(value) {
      const secret = String(value || '').trim();
      if (!secret || isProtectedSecretValue(secret)) return secret;
      const result = await window.electronAPI.protectSecret(secret);
      if (!result || !result.success || !result.value) {
        throw new Error(result?.error || 'API Key 加密失败');
      }
      return result.value;
    }

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

    async function migrateOldSettings() {
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
              apiKey: await protectSecretValue(old.apiKey || '')
            }],
            activeId: id
          });
        }
      } catch {}
    }

    async function migrateStoredSecrets() {
      const configs = loadModelConfigs();
      let configsDirty = false;
      if (configs && Array.isArray(configs.models)) {
        for (const model of configs.models) {
          if (model.apiKey && !isProtectedSecretValue(model.apiKey)) {
            model.apiKey = await protectSecretValue(model.apiKey);
            configsDirty = true;
          }
        }
        if (configsDirty) saveModelConfigs(configs);
      }

      const settings = parseSettingsSafe();
      if (settings.translateApiKey && !isProtectedSecretValue(settings.translateApiKey)) {
        settings.translateApiKey = await protectSecretValue(settings.translateApiKey);
        localStorage.setItem('aiSettings', JSON.stringify(settings));
      }
    }

    async function initializeProtectedSecrets() {
      await migrateOldSettings();
      await migrateStoredSecrets();
      renderModelList();
      updateModelIndicator();
      syncModelMenuState();
    }

    function getModelConfigs() {
      let configs = loadModelConfigs();
      if (!configs) {
        configs = { models: [], activeId: '' };
      }
      return configs;
    }

    function getActiveModel() {
      const configs = getModelConfigs();
      return configs.models.find(m => m.id === configs.activeId) || null;
    }

    function syncModelMenuState() {
      const configs = getModelConfigs();
      window.electronAPI.setModelMenuState({
        activeId: configs.activeId || '',
        models: (configs.models || []).map(m => ({
          id: m.id,
          name: m.name || m.model || '未命名模型'
        }))
      });
    }

    function switchModel(id) {
      const configs = getModelConfigs();
      if (configs.models.some(m => m.id === id)) {
        configs.activeId = id;
        saveModelConfigs(configs);
        updateModelIndicator();
        syncModelMenuState();
      }
    }

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
        editModelApiKey.value = isProtectedSecretValue(m.apiKey) ? '' : (m.apiKey || '');
        editModelApiKey.placeholder = m.apiKey ? '留空保留现有 API Key' : 'sk-...';
      } else {
        editModelName.value = '';
        editModelProvider.value = 'openai';
        editModelId.value = '';
        editModelBaseUrl.value = '';
        editModelApiKey.value = '';
        editModelApiKey.placeholder = 'sk-...';
      }
      modelEditForm.classList.remove('hidden');
      editModelName.focus();
    }

    function closeModelEditForm() {
      editingModelId = null;
      modelEditForm.classList.add('hidden');
    }

    async function saveModelEdit() {
      const name = editModelName.value.trim();
      const model = editModelId.value.trim();
      if (!name || !model) return;

      const configs = getModelConfigs();
      const inputApiKey = editModelApiKey.value.trim();
      if (editingModelId) {
        const m = configs.models.find(x => x.id === editingModelId);
        if (m) {
          m.name = name;
          m.provider = editModelProvider.value;
          m.model = model;
          m.baseUrl = editModelBaseUrl.value.trim();
          if (inputApiKey) m.apiKey = await protectSecretValue(inputApiKey);
        }
      } else {
        const id = Date.now().toString();
        configs.models.push({
          id,
          name,
          provider: editModelProvider.value,
          model,
          baseUrl: editModelBaseUrl.value.trim(),
          apiKey: await protectSecretValue(inputApiKey)
        });
        if (!configs.activeId) configs.activeId = id;
      }
      saveModelConfigs(configs);
      closeModelEditForm();
      renderModelList();
      updateModelIndicator();
      syncModelMenuState();
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
      syncModelMenuState();
    }

    function updateModelIndicator() {
      const m = getActiveModel();
      chatModelIndicator.textContent = m ? m.name : '';
    }

    function updateTranslateSettingsVisibility() {
      const isCustom = settingTranslateModelMode.value === 'custom';
      settingTranslateCustom.classList.toggle('hidden', !isCustom);
    }

    function loadSettings() {
      const settings = parseSettingsSafe();
      const translateModelMode = settings.translateModelMode === 'custom' ? 'custom' : 'same';

      if (Object.keys(settings).length > 0) {
        settingPetName.value = settings.petName || '';
        settingSystemPrompt.value = settings.systemPrompt || '';
      } else {
        settingPetName.value = '';
        settingSystemPrompt.value = '';
      }

      settingTranslateModelMode.value = translateModelMode;
      settingTranslateBaseUrl.value = settings.translateBaseUrl || '';
      settingTranslateModel.value = settings.translateModel || '';
      settingTranslateApiKey.value = isProtectedSecretValue(settings.translateApiKey) ? '' : (settings.translateApiKey || '');
      settingTranslateApiKey.placeholder = settings.translateApiKey ? '留空保留现有 API Key' : '本地服务可填任意非空值';
      updateTranslateSettingsVisibility();
      renderModelList();
      closeModelEditForm();
    }

    function getSettings() {
      const model = getActiveModel();
      if (!model || !model.baseUrl || !model.model || !model.apiKey) return null;
      const extra = parseSettingsSafe();
      return {
        baseUrl: model.baseUrl,
        model: model.model,
        apiKey: model.apiKey,
        provider: model.provider || 'openai',
        petName: extra.petName || '',
        systemPrompt: extra.systemPrompt || ''
      };
    }

    async function saveSettings() {
      const existing = parseSettingsSafe();
      const translateApiKeyInput = settingTranslateApiKey.value.trim();
      const settings = {
        petName: settingPetName.value.trim(),
        systemPrompt: settingSystemPrompt.value.trim(),
        translateModelMode: settingTranslateModelMode.value === 'custom' ? 'custom' : 'same',
        translateBaseUrl: settingTranslateBaseUrl.value.trim(),
        translateModel: settingTranslateModel.value.trim(),
        translateApiKey: translateApiKeyInput ? await protectSecretValue(translateApiKeyInput) : (existing.translateApiKey || '')
      };
      localStorage.setItem('aiSettings', JSON.stringify(settings));
      closeSettings();
    }

    function getTranslateModelConfig() {
      const settings = parseSettingsSafe();
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
      setSettingsOpen(true);
      stopIdleAnimations();
      loadSettings();
      settingsModal.classList.remove('hidden');
      setMouseCapture(true);
    }

    function closeSettings() {
      setSettingsOpen(false);
      settingsModal.classList.add('hidden');
      resumeIdleAnimationsIfAllowed();
      updateMouseCapture();
    }

    function bindSettingsEvents() {
      modelAddBtn.addEventListener('click', () => openModelEditForm(null));
      editModelSave.addEventListener('click', saveModelEdit);
      editModelCancel.addEventListener('click', closeModelEditForm);
      settingSave.addEventListener('click', saveSettings);
      settingCancel.addEventListener('click', closeSettings);
      settingTranslateModelMode.addEventListener('change', updateTranslateSettingsVisibility);
      settingsModal.querySelector('.settings-backdrop').addEventListener('click', closeSettings);
    }

    return {
      bindSettingsEvents,
      parseSettingsSafe,
      initializeProtectedSecrets,
      getSettings,
      getTranslateModelConfig,
      switchModel,
      updateModelIndicator,
      openSettings,
      closeSettings
    };
  }

  window.RobotSettings = {
    createSettingsController
  };
})();
