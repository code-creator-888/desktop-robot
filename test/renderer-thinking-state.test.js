const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rendererPath = path.join(__dirname, '..', 'renderer.js');
const rendererChatPath = path.join(__dirname, '..', 'renderer-chat.js');

function extractFunctionBody(source, signature) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `${signature} not found`);

  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(bodyStart + 1, i);
    }
  }

  throw new Error('sendMessage body parse failed');
}

test('sendMessage keeps thinking state until fallback pipeline ends', () => {
  const source = fs.readFileSync(rendererChatPath, 'utf8');
  const body = extractFunctionBody(source, 'async function sendMessage() {');

  assert.match(body, /setThinking\(true\)\s*;/, 'sendMessage should set thinking=true');
  assert.match(body, /try\s*\{[\s\S]*\}\s*finally\s*\{[\s\S]*setThinking\(false\)\s*;[\s\S]*\}/, 'thinking=false should only be reset in finally');

  const resets = body.match(/setThinking\(false\)\s*;/g) || [];
  assert.equal(resets.length, 1, 'should reset thinking=false exactly once');
});

test('sendMessage shows direct search results when summarize step fails', () => {
  const source = fs.readFileSync(rendererChatPath, 'utf8');
  assert.match(source, /function formatDirectSearchResults\(question, results\)/);
  assert.match(source, /async function tryWebSearchAnswer\(text, settings, searchingMsg\)/);
  assert.match(source, /const directResults = formatDirectSearchResults\(text, searchResult\.results \|\| \[\]\);/);
  assert.match(source, /联网搜索成功，但自动总结失败，已直接展示结果/);
});

test('sendMessage prefers web search first for time-sensitive questions', () => {
  const source = fs.readFileSync(rendererChatPath, 'utf8');
  assert.match(source, /function shouldPreferWebSearch\(text\)/);
  assert.match(source, /if \(settings\.autoWebFallback && shouldPreferWebSearch\(text\)\) \{/);
  assert.match(source, /这是时效性问题，我先联网搜索一下\.\.\./);
  assert.match(source, /月销量/);
});

test('single-click news rotates through fetched headlines instead of choosing randomly', () => {
  const source = fs.readFileSync(rendererPath, 'utf8');
  assert.match(source, /let hotNewsRotationIndex = 0;/);
  assert.match(source, /const idx = hotNewsRotationIndex % res\.headlines\.length;/);
  assert.match(source, /const pick = res\.headlines\[idx\];/);
  assert.match(source, /hotNewsRotationIndex = \(idx \+ 1\) % res\.headlines\.length;/);
  assert.doesNotMatch(source, /Math\.random\(\) \* res\.headlines\.length/);
});

test('sendMessage intercepts embedded webSearch tool-call text instead of rendering it raw', () => {
  const source = fs.readFileSync(rendererChatPath, 'utf8');
  assert.match(source, /function extractEmbeddedWebSearchQuery\(content, fallbackQuery\)/);
  assert.match(source, /if \(!\/functions\\\.webSearch\/i\.test\(text\)\) return '';/);
  assert.match(source, /const embeddedWebSearchQuery = settings\.autoWebFallback/);
  assert.match(source, /检测到联网搜索指令，正在执行\.\.\./);
});

test('openChat enables mouse capture to keep robot clickable after outside clicks', () => {
  const source = fs.readFileSync(rendererChatPath, 'utf8');
  const body = extractFunctionBody(source, 'function openChat() {');
  assert.match(body, /setMouseCapture\(true\)/, 'openChat should enable mouse capture');
});

test('chat open does not force whole-window mouse capture', () => {
  const source = fs.readFileSync(rendererPath, 'utf8');
  const updateBody = extractFunctionBody(source, 'function updateMouseCapture() {');
  assert.doesNotMatch(updateBody, /isChatOpen/, 'chat open should not force full-window capture');
});

test('chat panel selection is not intercepted by drag handling', () => {
  const source = fs.readFileSync(rendererPath, 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
  assert.match(source, /if \(e\.target\.closest\('#chat-panel'\)\) return;/);
  assert.match(css, /#chat-panel \{[\s\S]*user-select:\s*text;/);
  assert.match(css, /#chat-messages \{[\s\S]*user-select:\s*text;/);
});

test('chat input does not send while IME composition is active', () => {
  const source = fs.readFileSync(rendererChatPath, 'utf8');
  assert.match(source, /if \(e\.isComposing \|\| e\.keyCode === 229\) return;/);
  assert.match(source, /if \(e\.key === 'Enter'\) sendMessage\(\);/);
});

test('idle animations resume only when no UI remains open', () => {
  const source = fs.readFileSync(rendererPath, 'utf8');
  assert.match(source, /function resumeIdleAnimationsIfAllowed\(\) \{/);
  assert.match(source, /if \(!isUserInteracting\(\)\) startIdleAnimations\(\);/);
  assert.match(source, /function closeSettings\(\) \{[\s\S]*resumeIdleAnimationsIfAllowed\(\);/);
  assert.match(source, /function closeChat\(\) \{[\s\S]*resumeIdleAnimationsIfAllowed\(\);/);
  assert.match(source, /action === 'test-idle-yawn'/);
  assert.match(source, /action === 'test-idle-stretch'/);
  assert.match(source, /action === 'test-idle-rub-eyes'/);
  assert.match(source, /const idleActionClass = \['yawn-yawn', 'yawn-stretch', 'yawn-rub-eyes'\]/);
  assert.match(source, /const YAWN_ACTIONS = \[/);
  assert.match(source, /function updatePetPerspective\(clientX, clientY\)/);
  assert.match(source, /function resetPetPerspective\(\)/);
  assert.match(source, /function initRobot3D\(\)/);
  assert.match(source, /disposeRobot3D\(\);\s*if \(!robot3DHost\) return null;/);
  assert.match(source, /if \(!THREE \|\| typeof THREE\.WebGLRenderer !== 'function'\)/);
  assert.match(source, /try \{\s*renderer = new THREE\.WebGLRenderer\(\{ alpha: true, antialias: true \}\);\s*\} catch \(error\)/);
  assert.match(source, /initRobot3D\(\);/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'), /id="idle-effects"/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'), /class="idle-yawn-hand"/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'), /class="idle-self-hand left"/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'), /class="idle-self-hand right"/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'), /id="pet-stage"/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'), /id="pet-depth-stack"/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'), /node_modules\/three\/build\/three\.min\.js/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8'), /#pet-container\.idle-yawning \.idle-mouth/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8'), /#pet-container\.idle-yawning \.idle-yawn-hand/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8'), /#pet-container\.idle-rubbing \.idle-self-hand\.left/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8'), /#pet-stage \{/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8'), /#robot-3d-host \{/);
});

test('switch-model action keeps chat input editable', () => {
  const source = fs.readFileSync(rendererPath, 'utf8');
  assert.match(source, /action\.startsWith\('switch-model:'\)/, 'switch-model handler should exist');
  assert.match(source, /if\s*\(isChatOpen\)\s*\{[\s\S]*setMouseCapture\(true\)[\s\S]*chatInput\.focus\(\)/, 'switch-model should keep capture and refocus chat input');
});

test('mousemove passthrough should not disable capture while chat is open', () => {
  const source = fs.readFileSync(rendererPath, 'utf8');
  assert.match(source, /const overChatPanel = !!\(el && el\.closest\('#chat-panel'\)\);/, 'mousemove handler should detect chat panel hover');
  assert.match(source, /const overReminderCenter = !!\(el && el\.closest\('#reminder-center'\)\);/, 'mousemove handler should detect reminder center hover');
  assert.match(source, /if \(isChatOpen\) \{\s*resetPetPerspective\(\);/, 'chat open should stop pet perspective while preserving hover hit-testing');
  assert.match(source, /overChatPanel \|\|[\s\S]*overReminderCenter \|\|[\s\S]*overSettingsModal \|\|[\s\S]*overTodoList \|\|[\s\S]*overSystemMonitor \|\|[\s\S]*overPortMonitor \|\|[\s\S]*overSpeechBubble/, 'mousemove handler should keep capture only for interactive surfaces');
});

test('render toggles thinking-tech class by isThinking', () => {
  const source = fs.readFileSync(rendererPath, 'utf8');
  assert.match(source, /container\.classList\.toggle\('thinking-tech',\s*isThinking\)/);
});
