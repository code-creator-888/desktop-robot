const http = require('http');
const https = require('https');

function normalizeChatPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { error: 'Invalid chat payload' };
  }
  const baseUrl = String(payload.baseUrl || '').trim().replace(/\/+$/, '');
  const model = String(payload.model || '').trim();
  const provider = payload.provider === 'anthropic' ? 'anthropic' : 'openai';
  if (!baseUrl || !model) return { error: 'Missing model configuration' };
  let parsedBaseUrl;
  try {
    parsedBaseUrl = new URL(baseUrl);
  } catch {
    return { error: 'Invalid base URL' };
  }
  if (parsedBaseUrl.protocol !== 'https:' && parsedBaseUrl.protocol !== 'http:') {
    return { error: 'Unsupported base URL protocol' };
  }
  if (parsedBaseUrl.protocol === 'http:' && !['localhost', '127.0.0.1', '::1'].includes(parsedBaseUrl.hostname)) {
    return { error: 'HTTP base URL is only allowed for local debugging' };
  }
  const messages = Array.isArray(payload.messages) ? payload.messages.slice(-30).map((message) => ({
    role: ['system', 'user', 'assistant'].includes(message?.role) ? message.role : 'user',
    content: String(message?.content || '').slice(0, 20000)
  })).filter((message) => message.content) : [];
  if (messages.length === 0) return { error: 'Missing messages' };
  return {
    baseUrl,
    model: model.slice(0, 200),
    apiKey: String(payload.apiKey || ''),
    messages,
    provider,
    requestId: String(payload.requestId || '').slice(0, 80)
  };
}

function createChatIpc({ ipcMain, unprotectSecret }) {
  const activeChatRequests = new Map();

  function rememberChatRequest(requestId, req) {
    if (!requestId) return;
    const previous = activeChatRequests.get(requestId);
    if (previous && previous !== req) previous.destroy(new Error('Request cancelled'));
    activeChatRequests.set(requestId, req);
  }

  function forgetChatRequest(requestId, req) {
    if (requestId && activeChatRequests.get(requestId) === req) {
      activeChatRequests.delete(requestId);
    }
  }

  function cancelChatRequest(requestId) {
    const normalizedId = String(requestId || '').slice(0, 80);
    if (!normalizedId) return false;
    const req = activeChatRequests.get(normalizedId);
    if (!req) return false;
    req.destroy(new Error('Request cancelled'));
    activeChatRequests.delete(normalizedId);
    return true;
  }

  function registerIpc() {
    ipcMain.handle('chat', async (event, payload) => {
      try {
        const normalizedPayload = normalizeChatPayload(payload);
        if (normalizedPayload.error) return { success: false, error: normalizedPayload.error };
        const { baseUrl, model, apiKey, messages, provider, requestId } = normalizedPayload;
        const resolvedApiKey = unprotectSecret(apiKey);
        if (!resolvedApiKey) return { success: false, error: 'Missing API key' };
        const normalizedBaseUrl = baseUrl;
        const isAnthropic = provider === 'anthropic';

        let url, postData, options;

        if (isAnthropic) {
          const systemMsg = messages.find(m => m.role === 'system');
          const userMessages = messages.filter(m => m.role !== 'system');

          const anthropicBase = normalizedBaseUrl.replace(/\/v1\/?$/, '');
          url = new URL(anthropicBase + '/v1/messages');
          const body = {
            model,
            max_tokens: 4096,
            messages: userMessages
          };
          if (systemMsg) {
            body.system = systemMsg.content;
          }
          postData = JSON.stringify(body);

          const headers = {
            'Content-Type': 'application/json',
            'x-api-key': resolvedApiKey,
            'Content-Length': Buffer.byteLength(postData)
          };
          if (anthropicBase.includes('anthropic.com')) {
            headers['anthropic-version'] = '2023-06-01';
          }
          options = { method: 'POST', headers };
        } else {
          url = new URL(normalizedBaseUrl + '/chat/completions');
          postData = JSON.stringify({
            model,
            messages,
            temperature: 0.8,
            max_tokens: 150
          });

          options = {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${resolvedApiKey}`,
              'Content-Length': Buffer.byteLength(postData)
            }
          };
        }

        const client = url.protocol === 'https:' ? https : http;

        const content = await new Promise((resolve, reject) => {
          const req = client.request(url, options, (res) => {
            forgetChatRequest(requestId, req);
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
              if (res.statusCode < 200 || res.statusCode >= 300) {
                let errMsg;
                try {
                  const json = JSON.parse(data);
                  errMsg = json.error?.message || json.error?.msg || json.error?.type || JSON.stringify(json).slice(0, 300);
                } catch {
                  errMsg = data.slice(0, 300) || '(empty response)';
                }
                reject(new Error(`HTTP ${res.statusCode}: ${errMsg}`));
                return;
              }

              try {
                const json = JSON.parse(data);

                if (isAnthropic) {
                  const textBlock = json.content?.find?.(c => c.type === 'text');
                  if (textBlock && textBlock.text) {
                    resolve(textBlock.text);
                    return;
                  }
                  const thinkingBlock = json.content?.find?.(c => c.type === 'thinking');
                  if (thinkingBlock && thinkingBlock.thinking) {
                    resolve(thinkingBlock.thinking);
                    return;
                  }
                  reject(new Error('Unexpected Anthropic response: ' + JSON.stringify(json).slice(0, 200)));
                } else {
                  if (json.choices && json.choices[0] && json.choices[0].message) {
                    resolve(json.choices[0].message.content);
                  } else {
                    reject(new Error('Unexpected response: ' + JSON.stringify(json).slice(0, 200)));
                  }
                }
              } catch (e) {
                reject(new Error(`Parse error: ${data.slice(0, 200)}`));
              }
            });
          });

          rememberChatRequest(requestId, req);

          req.setTimeout(30000, () => {
            forgetChatRequest(requestId, req);
            req.destroy(new Error('Request timeout (30s)'));
            reject(new Error('Request timeout (30s)'));
          });

          req.on('error', (err) => {
            forgetChatRequest(requestId, req);
            reject(err);
          });
          req.write(postData);
          req.end();
        });

        return { success: true, content };
      } catch (err) {
        return { success: false, error: err.message };
      }
    });

    ipcMain.handle('cancel-chat', async (_event, requestId) => {
      return { success: cancelChatRequest(requestId) };
    });
  }

  return {
    registerIpc,
    cancelChatRequest,
    normalizeChatPayload
  };
}

module.exports = {
  createChatIpc,
  normalizeChatPayload
};
