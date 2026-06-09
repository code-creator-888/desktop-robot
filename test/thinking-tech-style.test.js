const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const cssPath = path.join(__dirname, '..', 'style.css');

test('tech prop is non-interactive and only visible when thinking', () => {
  const css = fs.readFileSync(cssPath, 'utf8');
  assert.match(css, /#tech-prop[\s\S]*pointer-events:\s*none/);
  assert.match(css, /#tech-prop[\s\S]*z-index:\s*120/);
  assert.match(css, /#tech-prop[\s\S]*top:\s*28px/);
  assert.match(css, /#chat-panel[\s\S]*z-index:\s*100/);
  assert.match(css, /#pet-container\.thinking-tech #tech-prop[\s\S]*opacity:\s*1/);
  assert.doesNotMatch(css, /\.tech-arm/);
  assert.match(css, /#pet-container\.thinking-tech #tech-prop \.tech-key-hit-left/);
  assert.match(css, /#pet-container\.thinking-tech #tech-prop \.tech-key-hit-right/);
  assert.match(css, /@keyframes tech-key-hit-left/);
  assert.match(css, /@keyframes tech-key-hit-right/);
  assert.match(css, /@keyframes tech-cursor-blink/);
  assert.match(css, /@keyframes tech-scan-line/);
  assert.match(css, /@keyframes tech-typing/);
});
