const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildSearchQueryVariants,
  dedupeResults,
  clampTopK,
  normalizeWebSearchPayload,
  parseDuckDuckGoResults,
  parseBingResults,
  parseSoResults,
  rankRelevantResults
} = require('../lib/web-fallback');

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

test('parseDuckDuckGoResults extracts title snippet and url', () => {
  const html = '<a class="result__a" href="https://a.com">A <b>Title</b></a><div><a class="result__snippet">Hello &amp; world</a></div>';
  assert.deepEqual(parseDuckDuckGoResults(html), [
    { title: 'A Title', snippet: 'Hello & world', url: 'https://a.com' }
  ]);
});

test('parseBingResults extracts title snippet and url', () => {
  const html = '<li class="b_algo"><h2><a href="https://b.com">B <strong>Title</strong></a></h2><div class="b_caption"><p>Snippet &amp; more</p></div></li>';
  assert.deepEqual(parseBingResults(html), [
    { title: 'B Title', snippet: 'Snippet & more', url: 'https://b.com' }
  ]);
});

test('parseSoResults extracts title snippet and prefers data-mdurl', () => {
  const html = '<li class="res-list"><h3 class="res-title "><a href="https://www.so.com/link?x=1" data-mdurl="https://real.example.com/page"><em>MONA L03</em>上市</a></h3><p class="res-desc">将于 7 月上市</p></li>';
  assert.deepEqual(parseSoResults(html), [
    { title: 'MONA L03 上市', snippet: '将于 7 月上市', url: 'https://real.example.com/page' }
  ]);
});

test('buildSearchQueryVariants expands compact model queries and removes noisy question terms', () => {
  assert.deepEqual(buildSearchQueryVariants('MONAL03什么时候上市'), [
    'MONAL03 什么时候上市',
    'MONA L03 什么时候上市',
    'MONA L03 上市'
  ]);
});

test('rankRelevantResults filters unrelated links and keeps model-matching results', () => {
  const input = [
    { title: 'Dropbox install', snippet: 'download dropbox', url: 'https://www.dropbox.com/install' },
    { title: '小鹏 MONA L03 上市', snippet: '7月16日上市', url: 'https://example.com/mona-l03' }
  ];
  assert.deepEqual(rankRelevantResults(input, 'MONA L03 上市', 5), [
    { title: '小鹏 MONA L03 上市', snippet: '7月16日上市', url: 'https://example.com/mona-l03' }
  ]);
});
