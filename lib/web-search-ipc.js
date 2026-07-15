const https = require('https');

function normalizeExternalUrl(url) {
  try {
    const parsed = new URL(String(url || '').trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function createWebSearchIpc({ ipcMain, shell }) {
  async function fetchHotNews(count = 3) {
    const url = new URL('https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc');
    const json = await new Promise((resolve, reject) => {
      const req = https.get(
        url,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(data);
            } else {
              reject(new Error(`HTTP ${res.statusCode}`));
            }
          });
        }
      );
      req.setTimeout(8000, () => req.destroy(new Error('News timeout')));
      req.on('error', reject);
    });
    const parsed = JSON.parse(json);
    const items = (parsed.data || []).slice(0, Math.min(count, 30));
    if (items.length === 0) return { success: false, error: 'No news items' };
    return {
      success: true,
      headlines: items.map((item) => ({
        title: item.Title,
        url: normalizeExternalUrl(item.Url) || ''
      }))
    };
  }

  function registerIpc() {
    ipcMain.handle('get-hot-news', async (_event, count = 3) => {
      try {
        return await fetchHotNews(count);
      } catch (err) {
        return { success: false, error: err.message };
      }
    });

    ipcMain.handle('open-external-url', async (_event, url) => {
      const normalizedUrl = normalizeExternalUrl(url);
      if (!normalizedUrl) {
        return { success: false, error: '无效链接' };
      }
      try {
        await shell.openExternal(normalizedUrl);
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message || String(err) };
      }
    });
  }

  return {
    registerIpc,
    fetchHotNews,
    normalizeExternalUrl
  };
}

module.exports = {
  createWebSearchIpc,
  normalizeExternalUrl
};
