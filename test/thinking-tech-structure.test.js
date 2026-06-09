const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const htmlPath = path.join(__dirname, '..', 'index.html');

test('pet container includes tech prop structure', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.match(html, /id="tech-prop"/);
  assert.match(html, /class="tech-laptop"/);
  assert.match(html, /class="tech-keyboard"/);
  assert.match(html, /class="tech-glow"/);
  assert.doesNotMatch(html, /class="tech-arm tech-arm-left"/);
  assert.doesNotMatch(html, /class="tech-arm tech-arm-right"/);
  assert.match(html, /class="tech-key-hit tech-key-hit-left"/);
  assert.match(html, /class="tech-key-hit tech-key-hit-right"/);
  assert.match(html, /class="tech-cursor"/);
});
