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
    const url = item && item.url ? String(item.url).trim() : '';
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

function normalizeWebSearchPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { error: 'Invalid payload' };
  }

  const query = String(payload.query || '').trim();
  if (!query) {
    return { error: 'Empty query' };
  }

  return {
    query,
    topK: clampTopK(payload.topK)
  };
}

module.exports = { clampTopK, dedupeResults, normalizeWebSearchPayload };
