const https = require('https');
const {
  buildSearchQueryVariants,
  dedupeResults,
  normalizeWebSearchPayload,
  parseDuckDuckGoResults,
  parseBingResults,
  parseSoResults,
  rankRelevantResults
} = require('./web-fallback');

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
  async function fetchSearchHtml(url, headers = {}, redirectCount = 0) {
    return await new Promise((resolve, reject) => {
      const req = https.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          ...headers
        }
      }, (res) => {
        const statusCode = res.statusCode || 0;
        if ([301, 302, 303, 307, 308].includes(statusCode)) {
          if (redirectCount >= 3) {
            reject(new Error(`Too many redirects for ${url.hostname}`));
            return;
          }
          const location = res.headers.location;
          if (!location) {
            reject(new Error(`Redirect without location for ${url.hostname}`));
            return;
          }
          resolve(fetchSearchHtml(new URL(location, url), headers, redirectCount + 1));
          return;
        }

        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (statusCode >= 200 && statusCode < 300) {
            resolve(data);
            return;
          }
          reject(new Error(`HTTP ${statusCode} from ${url.hostname}`));
        });
      });
      req.setTimeout(12000, () => req.destroy(new Error(`Search timeout from ${url.hostname}`)));
      req.on('error', reject);
    });
  }

  async function fetchHotNews(count = 3) {
    const url = new URL('https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc');
    const json = await new Promise((resolve, reject) => {
      const req = https.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });
      });
      req.setTimeout(8000, () => req.destroy(new Error('News timeout')));
      req.on('error', reject);
    });
    const parsed = JSON.parse(json);
    const items = (parsed.data || []).slice(0, Math.min(count, 30));
    if (items.length === 0) return { success: false, error: 'No news items' };
    return {
      success: true,
      headlines: items.map(item => ({
        title: item.Title,
        url: normalizeExternalUrl(item.Url) || ''
      }))
    };
  }

  function registerIpc() {
    ipcMain.handle('web-search', async (event, payload) => {
      const normalizedPayload = normalizeWebSearchPayload(payload);
      if (normalizedPayload.error) {
        return { success: false, error: normalizedPayload.error };
      }
      const { query, topK } = normalizedPayload;

      try {
        const providers = [
          {
            name: '360Search',
            parse: parseSoResults
          },
          {
            name: 'Bing',
            parse: parseBingResults
          },
          {
            name: 'DuckDuckGo',
            parse: parseDuckDuckGoResults
          }
        ];

        const failures = [];
        const queryVariants = buildSearchQueryVariants(query);
        for (const variant of queryVariants) {
          for (const provider of providers) {
            try {
              const providerUrl = provider.name === '360Search'
                ? new URL('https://www.so.com/s?q=' + encodeURIComponent(variant))
                : provider.name === 'Bing'
                  ? new URL('https://cn.bing.com/search?q=' + encodeURIComponent(variant))
                  : new URL('https://duckduckgo.com/html/?q=' + encodeURIComponent(variant));
              const html = await fetchSearchHtml(providerUrl);
              const parsed = dedupeResults(provider.parse(html), topK * 2);
              const results = rankRelevantResults(parsed, variant, topK);
              if (results.length > 0) {
                return { success: true, results };
              }
              failures.push(`${provider.name}(${variant}): No relevant search results`);
            } catch (error) {
              failures.push(`${provider.name}(${variant}): ${error.message}`);
            }
          }
        }

        return { success: false, error: failures.join('; ') || 'No relevant search results' };
      } catch (err) {
        return { success: false, error: err.message };
      }
    });

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
    fetchSearchHtml,
    normalizeExternalUrl
  };
}

module.exports = {
  createWebSearchIpc,
  normalizeExternalUrl
};
