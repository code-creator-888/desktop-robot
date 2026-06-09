const test = require('node:test');
const assert = require('node:assert/strict');
const { dedupeResults, clampTopK, buildFallbackPrompt, normalizeWebSearchPayload } = require('../lib/web-fallback');

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

test('dedupeResults trims fields and falls back title to url', () => {
  const out = dedupeResults([{ title: ' ', snippet: '  s  ', url: ' https://c.com ' }], 5);
  assert.deepEqual(out, [{ title: 'https://c.com', snippet: 's', url: 'https://c.com' }]);
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

test('buildFallbackPrompt handles non-array results safely', () => {
  const nullPrompt = buildFallbackPrompt('Q', null);
  const undefinedPrompt = buildFallbackPrompt('Q', undefined);
  const objectPrompt = buildFallbackPrompt('Q', { title: 'x' });

  assert.doesNotThrow(() => buildFallbackPrompt('Q', null));
  assert.match(nullPrompt.user, /证据：/);
  assert.doesNotMatch(nullPrompt.user, /1\./);
  assert.doesNotMatch(undefinedPrompt.user, /1\./);
  assert.doesNotMatch(objectPrompt.user, /1\./);
});

test('normalizeWebSearchPayload returns error for missing or invalid payload', () => {
  assert.deepEqual(normalizeWebSearchPayload(undefined), { error: 'Invalid payload' });
  assert.deepEqual(normalizeWebSearchPayload(null), { error: 'Invalid payload' });
  assert.deepEqual(normalizeWebSearchPayload('q=abc'), { error: 'Invalid payload' });
  assert.deepEqual(normalizeWebSearchPayload([]), { error: 'Invalid payload' });
});

test('normalizeWebSearchPayload trims query and clamps topK', () => {
  const normalized = normalizeWebSearchPayload({ query: '  hello  ', topK: 99 });
  assert.equal(normalized.query, 'hello');
  assert.equal(normalized.topK, 8);
});

test('normalizeWebSearchPayload rejects empty query with structured error', () => {
  assert.deepEqual(normalizeWebSearchPayload({ query: '   ', topK: 5 }), { error: 'Empty query' });
});
