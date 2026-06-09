# Web Fallback Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 当主模型请求失败时，自动执行网页搜索，并由同一模型总结后返回带来源链接的回答。

**Architecture:** 在主进程新增 `web-search` IPC，负责执行公开网页搜索并返回结构化结果；在渲染进程的 `sendMessage()` 失败分支触发搜索与二次总结；通过设置项控制自动回退开关与搜索结果数量。为保证可测性，将“搜索结果格式化/链接去重/回退提示词构建”抽到纯函数模块并做单测。

**Tech Stack:** Electron (main/preload/renderer), Node.js 内置 `http/https`, Node.js built-in test runner (`node --test`), CommonJS

---

### Task 1: 建立可测试的回退辅助模块（TDD 起点）

**Files:**
- Create: `lib/web-fallback.js`
- Create: `test/web-fallback.test.js`
- Modify: `package.json`

- [ ] **Step 1: 写失败测试（纯函数行为）**

```js
// test/web-fallback.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { dedupeResults, clampTopK, buildFallbackPrompt } = require('../lib/web-fallback');

test('clampTopK clamps into [3, 8] and defaults to 5', () => {
  assert.equal(clampTopK(undefined), 5);
  assert.equal(clampTopK(1), 3);
  assert.equal(clampTopK(5), 5);
  assert.equal(clampTopK(99), 8);
});

test('dedupeResults keeps first URL and drops duplicates/invalid', () => {
  const input = [
    { title: 'A', snippet: 'a1', url: 'https://a.com' },
    { title: 'A2', snippet: 'a2', url: 'https://a.com' },
    { title: 'B', snippet: 'b', url: 'https://b.com' },
    { title: '', snippet: 'x', url: '' }
  ];
  const out = dedupeResults(input, 5);
  assert.equal(out.length, 2);
  assert.equal(out[0].url, 'https://a.com');
  assert.equal(out[1].url, 'https://b.com');
});

test('buildFallbackPrompt includes evidence and citation requirement', () => {
  const prompt = buildFallbackPrompt('什么是 MCP？', [
    { title: 'Doc1', snippet: 'S1', url: 'https://x.dev/1' },
    { title: 'Doc2', snippet: 'S2', url: 'https://x.dev/2' }
  ]);
  assert.match(prompt.system, /附上来源链接/);
  assert.match(prompt.user, /https:\/\/x\.dev\/1/);
  assert.match(prompt.user, /什么是 MCP/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test test/web-fallback.test.js`  
Expected: FAIL，提示 `Cannot find module '../lib/web-fallback'` 或导出函数不存在

- [ ] **Step 3: 写最小实现让测试通过**

```js
// lib/web-fallback.js
function clampTopK(value) {
  const n = Number.isFinite(Number(value)) ? Number(value) : 5;
  if (n < 3) return 3;
  if (n > 8) return 8;
  return Math.floor(n);
}

function dedupeResults(results, topK) {
  const seen = new Set();
  const max = clampTopK(topK);
  const out = [];
  for (const item of Array.isArray(results) ? results : []) {
    const url = (item && item.url ? String(item.url).trim() : '');
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({
      title: String(item.title || '').trim() || url,
      snippet: String(item.snippet || '').trim(),
      url
    });
    if (out.length >= max) break;
  }
  return out;
}

function buildFallbackPrompt(question, results) {
  const lines = results.map((r, i) => `${i + 1}. ${r.title}\n${r.snippet}\n${r.url}`).join('\n\n');
  return {
    system: '你是检索总结助手。请根据证据回答问题，并在结尾附上 3-5 条来源链接。',
    user: `用户问题：${question}\n\n证据：\n${lines}\n\n请给出简洁结论并列出来源链接。`
  };
}

module.exports = { clampTopK, dedupeResults, buildFallbackPrompt };
```

- [ ] **Step 4: 再次运行测试确认通过**

Run: `node --test test/web-fallback.test.js`  
Expected: PASS（3 tests）

- [ ] **Step 5: 更新 npm 脚本并提交**

```json
// package.json (scripts)
{
  "scripts": {
    "start": "electron .",
    "test": "node --test"
  }
}
```

```bash
git add package.json lib/web-fallback.js test/web-fallback.test.js
git commit -m "test: add web fallback helper tests and implementation"
```

### Task 2: 在主进程实现网页搜索 IPC + 预加载桥接

**Files:**
- Modify: `main.js`（`ipcMain.handle('chat', ...)` 附近新增 `ipcMain.handle('web-search', ...)`）
- Modify: `preload.js`（`contextBridge.exposeInMainWorld` 添加 `webSearch`）
- Reuse: `lib/web-fallback.js`
- Test: `test/web-fallback.test.js`（补充结果规范化相关用例）

- [ ] **Step 1: 写失败测试（结果规范化）**

```js
// test/web-fallback.test.js (append)
const { dedupeResults } = require('../lib/web-fallback');

test('dedupeResults trims fields and falls back title to url', () => {
  const out = dedupeResults([{ title: ' ', snippet: '  s  ', url: ' https://c.com ' }], 5);
  assert.deepEqual(out, [{ title: 'https://c.com', snippet: 's', url: 'https://c.com' }]);
});
```

- [ ] **Step 2: 运行测试确认新增用例先失败**

Run: `node --test test/web-fallback.test.js`  
Expected: FAIL（字段 trim/fallback 行为尚未满足）

- [ ] **Step 3: 在 `main.js` 增加 `web-search` IPC（最小可用）**

```js
// main.js (add requires near top)
const { dedupeResults, clampTopK } = require('./lib/web-fallback');

// main.js (add handler near other ipcMain.handle)
ipcMain.handle('web-search', async (event, { query, topK }) => {
  const q = String(query || '').trim();
  if (!q) return { success: false, error: 'Empty query' };
  const k = clampTopK(topK);

  try {
    const url = new URL('https://duckduckgo.com/html/?q=' + encodeURIComponent(q));
    const html = await new Promise((resolve, reject) => {
      const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => (res.statusCode >= 200 && res.statusCode < 300 ? resolve(data) : reject(new Error(`HTTP ${res.statusCode}`))));
      });
      req.setTimeout(12000, () => req.destroy(new Error('Search timeout')));
      req.on('error', reject);
    });

    const blocks = [...html.matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)];
    const raw = blocks.map((m) => ({
      url: m[1].replace(/&amp;/g, '&'),
      title: m[2].replace(/<[^>]+>/g, '').trim(),
      snippet: m[3].replace(/<[^>]+>/g, '').trim()
    }));
    const results = dedupeResults(raw, k);
    if (results.length === 0) return { success: false, error: 'No search results' };
    return { success: true, results };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
```

- [ ] **Step 4: 暴露 preload API**

```js
// preload.js
contextBridge.exposeInMainWorld('electronAPI', {
  // ...
  chat: (config) => ipcRenderer.invoke('chat', config),
  webSearch: (payload) => ipcRenderer.invoke('web-search', payload),
  getEnvApiKey: () => ipcRenderer.invoke('get-env-api-key'),
  // ...
});
```

- [ ] **Step 5: 运行测试并提交**

Run: `node --test test/web-fallback.test.js`  
Expected: PASS（全部通过）

```bash
git add main.js preload.js test/web-fallback.test.js lib/web-fallback.js
git commit -m "feat: add main-process web search IPC for fallback"
```

### Task 3: 在聊天失败分支接入自动回退搜索+总结

**Files:**
- Modify: `renderer.js`（`getSettings()`、`saveSettings()`、`sendMessage()`）
- Modify: `index.html`（设置区增加回退配置项）
- Modify: `style.css`（新增配置项样式，复用现有设置风格）
- Reuse: `lib/web-fallback.js`（提示词格式由主进程/渲染协同）

- [ ] **Step 1: 写失败测试（回退格式函数）**

```js
// test/web-fallback.test.js (append)
const { buildFallbackPrompt } = require('../lib/web-fallback');

test('fallback prompt contains all evidence links', () => {
  const prompt = buildFallbackPrompt('Q', [
    { title: 'T1', snippet: 'S1', url: 'https://a.com' },
    { title: 'T2', snippet: 'S2', url: 'https://b.com' }
  ]);
  assert.match(prompt.user, /https:\/\/a\.com/);
  assert.match(prompt.user, /https:\/\/b\.com/);
});
```

- [ ] **Step 2: 运行测试确认当前行为不满足**

Run: `node --test test/web-fallback.test.js`  
Expected: FAIL（若提示词格式不完整）

- [ ] **Step 3: 增加设置项默认值与读取逻辑**

```js
// renderer.js (in getSettings return object)
return {
  baseUrl: model.baseUrl,
  model: model.model,
  apiKey: model.apiKey,
  provider: model.provider || 'openai',
  petName: extra.petName || '',
  systemPrompt: extra.systemPrompt || '',
  autoWebFallback: extra.autoWebFallback !== false,
  webSearchTopK: Number.isFinite(Number(extra.webSearchTopK)) ? Number(extra.webSearchTopK) : 5
};
```

```js
// renderer.js (in saveSettings)
const settings = {
  petName: settingPetName.value.trim(),
  systemPrompt: settingSystemPrompt.value.trim(),
  autoWebFallback: settingAutoWebFallback.checked,
  webSearchTopK: Number(settingWebSearchTopK.value) || 5
};
```

- [ ] **Step 4: 在 `sendMessage()` 失败分支接入回退流程**

```js
// renderer.js (inside sendMessage, in else branch of first chat call)
if (settings.autoWebFallback !== false) {
  const searchingMsg = '主模型失败，正在联网搜索并总结...';
  chatMessagesList.push({ role: 'assistant', content: searchingMsg });
  renderChatMessages();

  const search = await window.electronAPI.webSearch({ query: text, topK: settings.webSearchTopK });
  if (search.success) {
    const evidence = search.results
      .map((r, i) => `${i + 1}. ${r.title}\n${r.snippet}\n${r.url}`)
      .join('\n\n');
    const fallbackResult = await window.electronAPI.chat({
      baseUrl: settings.baseUrl,
      model: settings.model,
      apiKey: settings.apiKey,
      provider: settings.provider,
      messages: [
        { role: 'system', content: '你是检索总结助手。请基于证据回答，并附上 3-5 条来源链接。' },
        { role: 'user', content: `问题：${text}\n\n证据：\n${evidence}` }
      ]
    });
    if (fallbackResult.success) {
      chatMessagesList.push({ role: 'assistant', content: fallbackResult.content });
    } else {
      chatMessagesList.push({ role: 'assistant', content: `出错了：${result.error}；回退总结失败：${fallbackResult.error}` });
    }
  } else {
    chatMessagesList.push({ role: 'assistant', content: `出错了：${result.error}；联网搜索失败：${search.error}` });
  }
} else {
  chatMessagesList.push({ role: 'assistant', content: '出错了：' + result.error });
}
```

- [ ] **Step 5: 加入设置 UI 并提交**

```html
<!-- index.html (inside settings card) -->
<label class="inline-setting">
  <input type="checkbox" id="setting-auto-web-fallback" checked>
  主模型失败时自动网页搜索并总结
</label>
<label>网页搜索条数</label>
<input type="number" id="setting-web-search-topk" min="3" max="8" value="5">
```

```css
/* style.css */
.inline-setting {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  margin: 6px 0;
}
```

```bash
git add renderer.js index.html style.css test/web-fallback.test.js
git commit -m "feat: add automatic web-search fallback in chat flow"
```

### Task 4: 回归验证与文档更新

**Files:**
- Modify: `README.md`（中英文各补一条“失败自动联网搜索总结”说明）
- Optional notes: `docs/superpowers/specs/2026-06-09-web-fallback-design.md`（若实现偏离，回写决策）

- [ ] **Step 1: 运行单测**

Run: `npm test`  
Expected: PASS

- [ ] **Step 2: 手工验证路径**

Run: `npm start`  
Expected:
- 配置不可达模型地址后发送问题，看到“正在联网搜索并总结”提示
- 最终回答含总结正文与来源链接
- 关闭 `autoWebFallback` 后失败只显示原错误

- [ ] **Step 3: 更新 README 功能说明**

```md
- 🌐 **Web Fallback** — If primary model call fails, automatically search the web and summarize with citations.
- 🌐 **联网回退** — 主模型调用失败时，自动网页搜索并生成带引用的总结回复。
```

- [ ] **Step 4: 提交最终文档变更**

```bash
git add README.md
git commit -m "docs: document automatic web fallback behavior"
```
