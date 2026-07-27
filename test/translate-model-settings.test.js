const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const htmlPath = path.join(__dirname, '..', 'index.html');
const rendererPath = path.join(__dirname, '..', 'renderer.js');
const rendererTranslatePath = path.join(__dirname, '..', 'renderer-translate.js');
const rendererSettingsPath = path.join(__dirname, '..', 'renderer-settings.js');
const cssPath = path.join(__dirname, '..', 'style.css');

test('settings panel includes translate model mode and custom config inputs', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.match(html, />聊天模型</);
  assert.match(html, /这里配置聊天使用的主模型/);
  assert.match(html, />翻译模型</);
  assert.match(html, /只影响划词翻译，不影响聊天回复/);
  assert.match(html, />通用设置</);
  assert.match(html, /id="setting-translate-model-mode"/);
  assert.match(html, /id="setting-translate-custom"/);
  assert.match(html, /id="setting-translate-baseurl"/);
  assert.match(html, /id="setting-translate-model"/);
  assert.match(html, /id="setting-translate-apikey"/);
});

test('settings panel no longer exposes chat web fallback controls', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const renderer = fs.readFileSync(rendererPath, 'utf8');
  const settings = fs.readFileSync(rendererSettingsPath, 'utf8');

  assert.doesNotMatch(html, /失败时自动联网搜索|联网结果数量|联网回退|联网总结/);
  assert.doesNotMatch(html, /setting-auto-web-fallback|setting-web-search-topk/);
  assert.doesNotMatch(renderer, /settingAutoWebFallback|settingWebSearchTopK/);
  assert.doesNotMatch(settings, /autoWebFallback|webSearchTopK|clampWebSearchTopK|DEFAULT_WEB_SEARCH_TOPK/);
});

test('renderer supports translation model mode: same as chat or custom openai-compatible', () => {
  const renderer = fs.readFileSync(rendererPath, 'utf8');
  const settings = fs.readFileSync(rendererSettingsPath, 'utf8');
  assert.match(settings, /function getTranslateModelConfig\(\)/);
  assert.match(settings, /const mode = settings\.translateModelMode === 'custom' \? 'custom' : 'same'/);
  assert.match(settings, /provider:\s*'openai'/);
  assert.match(renderer, /getTranslateModelConfig,/);
  assert.match(renderer, /function getEnvModelConfig\(\)/);
  assert.match(renderer, /return settingsController\.getSettings\(\) \|\| getEnvModelConfig\(\)/);
  assert.match(renderer, /return mode === 'same' \? getEnvModelConfig\(\) : null/);
  assert.match(renderer, /translateController\.bindTranslateEvents\(\)/);
});

test('renderer enforces compact output format for english and chinese translation', () => {
  const source = fs.readFileSync(rendererTranslatePath, 'utf8');
  assert.match(source, /const isChineseInput = containsChinese\(text\)/);
  assert.match(source, /请把以下英文或外语翻译成中文，并严格输出：英文原词：中文翻译/);
  assert.match(source, /请严格输出：中文词（带声调拼音）：中文解释/);
  assert.match(source, /英文示例：diff：差异/);
  assert.match(source, /中文示例：测试（cèshì）：用于验证功能是否正常/);
  assert.match(source, /function needsChineseExplainRepair\(/);
  assert.match(source, /function needsEnglishTranslateRepair\(/);
  assert.match(source, /Analyze the Request\|Role:\|Task:\|Constraints:\|Input text\|Output exactly one line/);
  assert.match(source, /const TRANSLATION_FALLBACKS = \{/);
  assert.match(source, /function getEnglishTranslateFallback\(/);
  assert.match(source, /function formatTranslateError\(/);
  assert.match(source, /diff：差异/);
  assert.match(source, /normalizedLeft/);
  assert.match(source, /\[A-Za-z0-9 _\.\/\(\)-\]/);
  assert.match(source, /模型只返回了思考过程，未返回最终译文/);
  assert.match(source, /模型返回为空/);
  assert.match(source, /function formatEnglishTranslationResult\(/);
  assert.match(source, /if\s*\(needsChineseExplainRepair\(text,\s*reply\)\)/);
  assert.match(source, /if\s*\(needsEnglishTranslateRepair\(text,\s*reply\)\)/);
  assert.match(source, /if\s*\(!containsChinese\(text\)\)\s*\{/);
  assert.match(source, /reply = formatEnglishTranslationResult\(text,\s*reply\)/);
  assert.match(source, /maxTokens:\s*1024/);
  assert.match(source, /const fallbackReply = getEnglishTranslateFallback\(text\)/);
  assert.match(source, /模型未返回中文译文/);
  assert.match(source, /tonePinyinPattern/);
  assert.match(source, /compactChinesePattern/);
  assert.match(source, /appendTranslateMessage\(reply\)/);
  assert.match(source, /翻译失败：/);
  assert.match(source, /翻译出错：/);
});

test('speech bubble wraps only when text exceeds threshold', () => {
  const renderer = fs.readFileSync(rendererPath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');
  assert.match(renderer, /const SPEECH_WRAP_THRESHOLD = 18/);
  assert.match(renderer, /speechBubble\.classList\.toggle\('wrap',\s*text\.length > SPEECH_WRAP_THRESHOLD\)/);
  assert.match(css, /#speech-bubble[\s\S]*white-space:\s*nowrap/);
  assert.match(css, /#speech-bubble\.wrap[\s\S]*white-space:\s*normal/);
  assert.match(css, /#speech-bubble\.wrap[\s\S]*width:\s*min\(320px,\s*40vw\)/);
  assert.match(css, /#speech-bubble\.wrap[\s\S]*min-width:\s*180px/);
});

test('settings panel visually separates chat translate and general sections', () => {
  const css = fs.readFileSync(cssPath, 'utf8');
  assert.match(css, /\.settings-section \{/);
  assert.match(css, /\.settings-section-header h4 \{/);
  assert.match(css, /\.settings-section-header p \{/);
  assert.match(css, /\.settings-subsection-title \{/);
});

test('settings panel scrolls when content exceeds viewport height', () => {
  const css = fs.readFileSync(cssPath, 'utf8');
  assert.match(css, /\.settings-card \{[\s\S]*max-height:\s*min\(82vh,\s*760px\);/);
  assert.match(css, /\.settings-card \{[\s\S]*overflow-y:\s*auto;/);
});
