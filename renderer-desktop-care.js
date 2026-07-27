(function () {
  function createDesktopCareController(deps) {
    const {
      elements,
      appendTextElement,
      appendButton,
      showSpeech,
      setMouseCapture,
      stopIdleAnimations,
      resumeIdleAnimationsIfAllowed,
      updateMouseCapture,
      setDesktopCareOpen,
      openSystemMonitor,
      openPortMonitor
    } = deps;
    const {
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
    } = elements;

    let refreshing = false;

    function switchTab(tabName) {
      desktopCare.querySelectorAll('.monitor-tab').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
      });
      desktopCare.querySelectorAll('.monitor-tab-content').forEach((el) => {
        el.classList.toggle('active', el.id === `desktop-care-tab-${tabName}`);
      });
    }

    function setRefreshButtonState(loading) {
      desktopCareRefresh.disabled = loading;
      desktopCareRefresh.textContent = loading ? '刷新中...' : '刷新';
    }

    function setLoadingState() {
      desktopCareStatus.textContent = '正在检查电脑状态...';
      desktopCareCleanupSummary.textContent = '正在扫描缓存目录...';
      desktopCareStartupSummary.textContent = '正在读取启动项...';
    }

    function renderSuggestions(items) {
      desktopCareSuggestions.innerHTML = '';
      items.forEach((item) => {
        const row = document.createElement('div');
        row.className = `desktop-care-item level-${item.level || 'good'}`;

        const main = document.createElement('div');
        main.className = 'desktop-care-item-main';
        appendTextElement(main, 'div', 'desktop-care-item-title', item.title);
        appendTextElement(main, 'div', 'desktop-care-item-detail', item.detail);
        row.appendChild(main);

        if (item.action?.type && item.action?.label) {
          appendButton(row, 'desktop-care-action-btn', item.action.label, {
            actionType: item.action.type,
            actionTarget: item.action.target || ''
          });
        }

        desktopCareSuggestions.appendChild(row);
      });

      desktopCareSuggestions.querySelectorAll('.desktop-care-action-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const actionType = btn.dataset.actionType;
          const actionTarget = btn.dataset.actionTarget;
          if (actionType === 'switch-tab' && actionTarget) {
            switchTab(actionTarget);
            return;
          }
          if (actionType === 'open-system-monitor') {
            closeDesktopCare();
            openSystemMonitor();
            return;
          }
          if (actionType === 'open-port-monitor') {
            closeDesktopCare();
            openPortMonitor();
            return;
          }
        });
      });
    }

    function renderCleanupTargets(items) {
      desktopCareCleanupList.innerHTML = '';
      if (!Array.isArray(items) || items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'desktop-care-empty';
        empty.textContent = '暂未配置可扫描的缓存目录。';
        desktopCareCleanupList.appendChild(empty);
        return;
      }

      items.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'desktop-care-item';

        const main = document.createElement('div');
        main.className = 'desktop-care-item-main';
        appendTextElement(main, 'div', 'desktop-care-item-title', item.name);
        appendTextElement(main, 'div', 'desktop-care-item-detail', `${item.path} · ${item.sizeLabel}`);
        row.appendChild(main);

        appendButton(row, 'desktop-care-clean-btn', item.canClean ? '清理' : '空目录', { targetId: item.id });
        const actionBtn = row.querySelector('.desktop-care-clean-btn');
        actionBtn.disabled = !item.canClean;
        desktopCareCleanupList.appendChild(row);
      });

      desktopCareCleanupList.querySelectorAll('.desktop-care-clean-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (btn.disabled) return;
          btn.disabled = true;
          const result = await window.electronAPI.cleanDesktopCareTarget(btn.dataset.targetId);
          if (result?.success) {
            const cleanupText =
              result.failed > 0
                ? `主人，清掉了 ${result.reclaimedLabel}，还有 ${result.failed} 项没删掉`
                : `主人，清掉了 ${result.reclaimedLabel} 缓存`;
            showSpeech(cleanupText, 3200);
            await refreshSummary();
          } else {
            btn.disabled = false;
            showSpeech(result?.error || '缓存清理失败', 2400);
          }
        });
      });
    }

    function renderStartupItems(items) {
      desktopCareStartupList.innerHTML = '';
      if (!Array.isArray(items) || items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'desktop-care-empty';
        empty.textContent = '暂未发现登录启动项，或者当前系统未返回可读数据。';
        desktopCareStartupList.appendChild(empty);
        return;
      }

      items.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = 'desktop-care-item';
        const main = document.createElement('div');
        main.className = 'desktop-care-item-main';
        appendTextElement(main, 'div', 'desktop-care-item-title', `${index + 1}. ${item.name}`);
        row.appendChild(main);
        appendButton(row, 'desktop-care-action-btn', '禁止自动启动', { itemName: item.name });
        desktopCareStartupList.appendChild(row);
      });

      desktopCareStartupList.querySelectorAll('.desktop-care-action-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          const result = await window.electronAPI.removeDesktopCareStartupItem(btn.dataset.itemName);
          if (result?.success) {
            showSpeech(`主人，已禁止 ${result.itemName} 自动启动`, 3200);
            await refreshSummary();
            return;
          }
          btn.disabled = false;
          showSpeech(result?.error || '关闭自动启动失败', 2400);
        });
      });
    }

    async function refreshSummary() {
      if (refreshing) return;
      refreshing = true;
      setRefreshButtonState(true);
      setLoadingState();

      try {
        const summary = await window.electronAPI.getDesktopCareSummary();
        if (!summary || summary.error) {
          desktopCareStatus.textContent = summary?.error || '读取电脑状态失败';
          return;
        }

        const updatedAt = new Date(summary.generatedAt).toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit'
        });
        desktopCareStatus.textContent = `状态：${summary.overview.riskLevel} · 更新于 ${updatedAt}`;
        desktopCareCleanupSummary.textContent = `已扫描 ${summary.cleanupTargets.length} 项，共 ${summary.overview.cleanupLabel}`;
        desktopCareStartupSummary.textContent = `当前检测到 ${summary.overview.startupItemCount} 个登录启动项`;
        desktopCareRisk.textContent = summary.overview.riskLevel;
        desktopCareCpu.textContent = summary.overview.cpu;
        desktopCareMem.textContent = summary.overview.memPercent;
        desktopCareDisk.textContent = `${summary.overview.diskFree} 剩余`;
        desktopCareServices.textContent = `${summary.overview.listeningServiceCount} 个`;
        desktopCareCleanupSize.textContent = summary.overview.cleanupLabel;

        renderSuggestions(summary.suggestions || []);
        renderCleanupTargets(summary.cleanupTargets || []);
        renderStartupItems(summary.startupItems || []);
      } finally {
        refreshing = false;
        setRefreshButtonState(false);
      }
    }

    function openDesktopCare() {
      setDesktopCareOpen(true);
      stopIdleAnimations();
      desktopCare.classList.remove('hidden');
      setMouseCapture(true);
      switchTab('overview');
      refreshSummary();
    }

    function closeDesktopCare() {
      setDesktopCareOpen(false);
      desktopCare.classList.add('hidden');
      resumeIdleAnimationsIfAllowed();
      updateMouseCapture();
    }

    function bindDesktopCareEvents() {
      desktopCareClose.addEventListener('click', closeDesktopCare);
      desktopCareRefresh.addEventListener('click', refreshSummary);
      desktopCare.querySelector('.monitor-backdrop').addEventListener('click', closeDesktopCare);
      desktopCare.querySelectorAll('.monitor-tab').forEach((btn) => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
      });
    }

    return {
      bindDesktopCareEvents,
      openDesktopCare,
      closeDesktopCare,
      refreshSummary
    };
  }

  window.RobotDesktopCare = {
    createDesktopCareController
  };
})();
