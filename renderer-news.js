(function () {
  function createNewsController(deps) {
    const {
      elements,
      appendTextElement,
      stopIdleAnimations,
      resumeIdleAnimationsIfAllowed,
      setMouseCapture,
      updateMouseCapture,
      setNewsOpen
    } = deps;

    const { newsPanel, newsPanelClose, newsPanelRefresh, newsPanelStatus, newsListEl } = elements;

    const NEWS_AUTO_REFRESH_MS = 5 * 60 * 1000;
    let hotNewsRotationIndex = 0;
    let cachedHotNewsHeadlines = [];
    let newsRefreshInFlight = false;
    let newsAutoRefreshTimer = null;

    async function fetchHotNewsHeadlines() {
      const res = await window.electronAPI.getHotNews(30);
      if (res?.success && Array.isArray(res.headlines) && res.headlines.length > 0) {
        cachedHotNewsHeadlines = res.headlines
          .slice(0, 30)
          .map((item) => ({
            title: typeof item === 'string' ? item : String(item?.title || ''),
            url: typeof item === 'string' ? '' : String(item?.url || '')
          }))
          .filter((item) => item.title);
        hotNewsRotationIndex %= cachedHotNewsHeadlines.length;
      }
      return res;
    }

    async function openNewsItem(url) {
      const result = await window.electronAPI.openExternalUrl(url);
      if (!result?.success) {
        newsPanelStatus.textContent = result?.error || '打开新闻失败';
      }
    }

    function renderNewsList(items, statusText) {
      if (!newsListEl || !newsPanelStatus) return;
      newsPanelStatus.textContent = statusText;
      newsListEl.innerHTML = '';

      if (!Array.isArray(items) || items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'news-item-empty';
        empty.textContent = '暂无新闻，请稍后刷新。';
        newsListEl.appendChild(empty);
        return;
      }

      items.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = 'news-item';
        appendTextElement(row, 'span', 'news-item-index', `${index + 1}.`);
        const titleBtn = document.createElement('button');
        titleBtn.className = 'news-item-title';
        titleBtn.textContent = item.title;
        titleBtn.disabled = !item.url;
        if (item.url) {
          titleBtn.title = '点击打开新闻';
          titleBtn.addEventListener('click', () => {
            openNewsItem(item.url);
          });
        }
        row.appendChild(titleBtn);
        newsListEl.appendChild(row);
      });
    }

    async function refreshNewsPanel(manual = false) {
      if (newsRefreshInFlight) return;
      newsRefreshInFlight = true;
      if (newsPanelRefresh) {
        newsPanelRefresh.disabled = true;
        newsPanelRefresh.textContent = manual ? '刷新中...' : '更新中...';
      }
      if (manual && newsPanelStatus) newsPanelStatus.textContent = '正在刷新最新新闻...';

      try {
        const res = await fetchHotNewsHeadlines();
        if (!res.success || !cachedHotNewsHeadlines.length) {
          renderNewsList([], `新闻更新失败：${res.error || '未知错误'}`);
          return;
        }
        const updatedAt = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        renderNewsList(cachedHotNewsHeadlines, `已更新 ${updatedAt} · 自动每 5 分钟刷新`);
      } catch {
        renderNewsList([], '新闻更新失败，请稍后再试。');
      } finally {
        newsRefreshInFlight = false;
        if (newsPanelRefresh) {
          newsPanelRefresh.disabled = false;
          newsPanelRefresh.textContent = '刷新';
        }
      }
    }

    function startNewsAutoRefresh() {
      stopNewsAutoRefresh();
      newsAutoRefreshTimer = setInterval(() => {
        refreshNewsPanel(false);
      }, NEWS_AUTO_REFRESH_MS);
    }

    function stopNewsAutoRefresh() {
      if (newsAutoRefreshTimer) {
        clearInterval(newsAutoRefreshTimer);
        newsAutoRefreshTimer = null;
      }
    }

    function openNewsPanel() {
      setNewsOpen(true);
      stopIdleAnimations();
      newsPanel.classList.remove('hidden');
      setMouseCapture(true);
      renderNewsList(cachedHotNewsHeadlines, '正在加载新闻...');
      refreshNewsPanel(false);
      startNewsAutoRefresh();
    }

    function closeNewsPanel() {
      setNewsOpen(false);
      stopNewsAutoRefresh();
      newsPanel.classList.add('hidden');
      resumeIdleAnimationsIfAllowed();
      updateMouseCapture();
    }

    async function nextHotNewsLine() {
      try {
        const res = await fetchHotNewsHeadlines();
        if (!res.success || cachedHotNewsHeadlines.length === 0) return '新闻获取失败，下次再试吧~';
        const idx = hotNewsRotationIndex % cachedHotNewsHeadlines.length;
        const pick = cachedHotNewsHeadlines[idx];
        hotNewsRotationIndex = (idx + 1) % cachedHotNewsHeadlines.length;
        return { text: `📰 ${pick.title}`, duration: 6000, type: 'news' };
      } catch {
        return '新闻获取失败，下次再试吧~';
      }
    }

    function bindNewsEvents() {
      newsPanelClose.addEventListener('click', closeNewsPanel);
      newsPanelRefresh.addEventListener('click', () => {
        refreshNewsPanel(true);
      });
      newsPanel.querySelector('.monitor-backdrop').addEventListener('click', closeNewsPanel);
    }

    return {
      bindNewsEvents,
      openNewsPanel,
      closeNewsPanel,
      refreshNewsPanel,
      fetchHotNewsHeadlines,
      nextHotNewsLine
    };
  }

  window.RobotNews = {
    createNewsController
  };
})();
