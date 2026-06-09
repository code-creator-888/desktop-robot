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

function buildFallbackPrompt(question, results) {
  const safeResults = Array.isArray(results) ? results : [];
  const lines = safeResults
    .map((r, i) => `${i + 1}. ${r.title}\n${r.snippet}\n${r.url}`)
    .join('\n\n');

  return {
    system: '你是检索总结助手。请根据证据回答问题，并在结尾附上来源链接。',
    user: `用户问题：${question}\n\n证据：\n${lines}\n\n请给出简洁结论并列出来源链接。`
  };
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

module.exports = { clampTopK, dedupeResults, buildFallbackPrompt, normalizeWebSearchPayload };
