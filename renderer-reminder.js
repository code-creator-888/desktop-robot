(function () {
  const REMINDER_STORAGE_KEY = 'reminderItems';
  const VALID_RULE_TYPES = ['one-time', 'daily', 'weekly', 'workday'];

  function createReminderController(deps) {
    const {
      elements,
      dom,
      showSpeech,
      setMouseCapture,
      reportRobotBounds,
      updateMouseCapture,
      stopIdleAnimations,
      resumeIdleAnimationsIfAllowed,
      clearSpeechTimeout,
      setReminderOpen,
      isReminderOpen
    } = deps;
    const {
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
    } = elements;
    const { appendTextElement, appendButton, appendReminderRuleOptions } = dom;

    let reminderItems = [];
    let editingReminderId = null;
    let countdownInterval = null;
    let currentAlertItem = null;

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
                type: VALID_RULE_TYPES.includes(ruleType) ? ruleType : 'one-time'
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
          const form = document.createElement('div');
          form.className = 'reminder-edit-form';

          const titleInput = document.createElement('input');
          titleInput.type = 'text';
          titleInput.className = 'reminder-edit-title';
          titleInput.value = item.title;
          titleInput.maxLength = 60;
          form.appendChild(titleInput);

          const timeInput = document.createElement('input');
          timeInput.type = 'datetime-local';
          timeInput.className = 'reminder-edit-time';
          timeInput.value = localTime;
          form.appendChild(timeInput);

          const ruleSelect = document.createElement('select');
          ruleSelect.className = 'reminder-edit-rule';
          appendReminderRuleOptions(ruleSelect, ruleType);
          form.appendChild(ruleSelect);

          const actions = document.createElement('div');
          actions.className = 'reminder-item-actions';
          appendButton(actions, 'reminder-save-btn', '保存', { id: item.id });
          appendButton(actions, 'reminder-cancel-btn', '取消', { id: item.id });

          row.appendChild(form);
          row.appendChild(actions);
        } else {
          const triggerTs = new Date(item.nextTriggerAt || item.dueAt).getTime();
          const main = document.createElement('div');
          main.className = 'reminder-item-main';
          appendTextElement(main, 'div', 'reminder-item-title', item.title);
          appendTextElement(main, 'div', 'reminder-item-meta', `${formatReminderTime(item.nextTriggerAt || item.dueAt)} · ${formatReminderRule(ruleType)}`);
          if (item.status !== 'done') {
            const countdown = document.createElement('div');
            countdown.className = 'reminder-countdown';
            countdown.dataset.triggerTs = String(triggerTs);
            main.appendChild(countdown);
          }

          const actions = document.createElement('div');
          actions.className = 'reminder-item-actions';
          appendButton(actions, 'reminder-edit-btn', '编辑', { id: item.id });
          appendButton(actions, 'reminder-done-btn', '完成', { id: item.id });
          appendButton(actions, 'reminder-delete-btn', '删除', { id: item.id });

          row.appendChild(main);
          row.appendChild(actions);
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
          item.rule = { type: VALID_RULE_TYPES.includes(ruleVal) ? ruleVal : 'one-time' };
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

      if (isReminderOpen()) startCountdown();
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
      const selectedRuleType = VALID_RULE_TYPES.includes(reminderRuleType?.value) ? reminderRuleType.value : 'one-time';
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
      setReminderOpen(true);
      stopIdleAnimations();
      reminderCenter.classList.remove('hidden');
      setMouseCapture(true);
      renderReminderList();
      startCountdown();
    }

    function closeReminderCenter() {
      setReminderOpen(false);
      stopCountdown();
      reminderCenter.classList.add('hidden');
      resumeIdleAnimationsIfAllowed();
      updateMouseCapture();
    }

    function handleSpeechBubbleClick() {
      if (!speechBubble.classList.contains('clickable') && !speechBubble.classList.contains('news')) return;
      speechBubble.classList.add('hidden');
      speechBubble.classList.remove('clickable', 'news');
      snoozeBar.classList.add('hidden');
      currentAlertItem = null;
      reportRobotBounds();
      clearSpeechTimeout();
      updateMouseCapture();
    }

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

    function bindReminderEvents() {
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
        handleSpeechBubbleClick();
      });
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
    }

    function init() {
      reminderItems = loadReminderItems();
      checkDueReminders();
      setInterval(checkDueReminders, 30000);
    }

    function clearCurrentAlert() {
      currentAlertItem = null;
    }

    return {
      init,
      bindReminderEvents,
      openReminderCenter,
      closeReminderCenter,
      addManualReminder,
      checkDueReminders,
      doSnooze,
      handleSpeechBubbleClick,
      clearCurrentAlert
    };
  }

  window.RobotReminder = {
    createReminderController
  };
})();
