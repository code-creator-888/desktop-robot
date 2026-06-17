const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rendererPath = path.join(__dirname, '..', 'renderer.js');

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
  const source = fs.readFileSync(rendererPath, 'utf8');
  const body = extractFunctionBody(source, 'async function sendMessage() {');

  assert.match(body, /isThinking\s*=\s*true\s*;/, 'sendMessage should set isThinking=true');
  assert.match(body, /try\s*\{[\s\S]*\}\s*finally\s*\{[\s\S]*isThinking\s*=\s*false\s*;[\s\S]*\}/, 'isThinking=false should only be reset in finally');

  const resets = body.match(/isThinking\s*=\s*false\s*;/g) || [];
  assert.equal(resets.length, 1, 'should reset isThinking=false exactly once');
});

test('openChat enables mouse capture to keep robot clickable after outside clicks', () => {
  const source = fs.readFileSync(rendererPath, 'utf8');
  const body = extractFunctionBody(source, 'function openChat() {');
  assert.match(body, /setMouseCapture\(true\)/, 'openChat should enable mouse capture');
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
  assert.match(source, /setMouseCapture\(overContainer \|\| overChatPanel \|\| overReminderCenter \|\| overSpeechBubble\);/, 'mousemove handler should keep capture for robot, chat panel, reminder center, or speech bubble');
});

test('render toggles thinking-tech class by isThinking', () => {
  const source = fs.readFileSync(rendererPath, 'utf8');
  assert.match(source, /container\.classList\.toggle\('thinking-tech',\s*isThinking\)/);
});
