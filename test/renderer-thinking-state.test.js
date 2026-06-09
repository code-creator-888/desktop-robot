const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rendererPath = path.join(__dirname, '..', 'renderer.js');

function extractSendMessageBody(source) {
  const start = source.indexOf('async function sendMessage() {');
  assert.notEqual(start, -1, 'sendMessage function not found');

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
  const body = extractSendMessageBody(source);

  assert.match(body, /isThinking\s*=\s*true\s*;/, 'sendMessage should set isThinking=true');
  assert.match(body, /try\s*\{[\s\S]*\}\s*finally\s*\{[\s\S]*isThinking\s*=\s*false\s*;[\s\S]*\}/, 'isThinking=false should only be reset in finally');

  const resets = body.match(/isThinking\s*=\s*false\s*;/g) || [];
  assert.equal(resets.length, 1, 'should reset isThinking=false exactly once');
});
