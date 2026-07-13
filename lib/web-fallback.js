function clampTopK(value) {
  const n = Number.isFinite(Number(value)) ? Number(value) : 5;
  if (n < 3) return 3;
  if (n > 8) return 8;
  return Math.floor(n);
}

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function stripHtml(text) {
  return decodeHtmlEntities(String(text || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

const QUERY_NOISE_PATTERNS = [
  /什么时候/g,
  /何时/g,
  /啥时候/g,
  /几时/g,
  /多久/g,
  /现在/g,
  /目前/g,
  /最新/g,
  /今天/g,
  /今日/g,
  /刚刚/g,
  /近期/g,
  /近况/g
];

function normalizeSearchText(text) {
  return String(text || '')
    .replace(/([A-Za-z0-9])([\u4e00-\u9fff])/g, '$1 $2')
    .replace(/([\u4e00-\u9fff])([A-Za-z0-9])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSearchQueryVariants(query) {
  const variants = [];
  const push = (value) => {
    const normalized = normalizeSearchText(value);
    if (normalized && !variants.includes(normalized)) variants.push(normalized);
  };

  const base = normalizeSearchText(query);
  push(base);

  const expandedModel = base.replace(/\b([A-Za-z]{3,}?)([A-Za-z]\d{2,4})\b/g, '$1 $2');
  push(expandedModel);

  let keywordFocused = expandedModel;
  QUERY_NOISE_PATTERNS.forEach((pattern) => {
    keywordFocused = keywordFocused.replace(pattern, ' ');
  });
  push(keywordFocused);

  return variants;
}

function extractAsciiTokens(query) {
  return normalizeSearchText(query)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map(token => token.trim())
    .filter(token => token.length >= 2);
}

function scoreResultAgainstQuery(item, query) {
  const haystack = normalizeSearchText(`${item?.title || ''} ${item?.snippet || ''} ${item?.url || ''}`).toLowerCase();
  const asciiTokens = extractAsciiTokens(query);
  if (asciiTokens.length === 0) return 1;
  let score = 0;
  for (const token of asciiTokens) {
    if (haystack.includes(token)) score += token.length >= 4 ? 3 : 2;
  }
  return score;
}

function rankRelevantResults(results, query, topK) {
  return dedupeResults(
    (Array.isArray(results) ? results : [])
      .map(item => ({ ...item, _score: scoreResultAgainstQuery(item, query) }))
      .filter(item => item._score > 0)
      .sort((a, b) => b._score - a._score),
    topK
  );
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

function parseDuckDuckGoResults(html) {
  const blocks = [
    ...String(html || '').matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)
  ];
  return blocks.map((m) => ({
    url: decodeHtmlEntities(m[1]),
    title: stripHtml(m[2]),
    snippet: stripHtml(m[3])
  }));
}

function parseBingResults(html) {
  const blocks = [
    ...String(html || '').matchAll(/<li class="b_algo"[\s\S]*?<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>[\s\S]*?(?:<div class="b_caption"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>[\s\S]*?<\/div>)?/g)
  ];
  return blocks.map((m) => ({
    url: decodeHtmlEntities(m[1]),
    title: stripHtml(m[2]),
    snippet: stripHtml(m[3] || '')
  }));
}

function parseSoResults(html) {
  const blocks = [
    ...String(html || '').matchAll(/<li class="res-list"[\s\S]*?<h3 class="res-title[^"]*"[^>]*>\s*<a[^>]*href="([^"]+)"(?:[^>]*data-mdurl="([^"]+)")?[^>]*>([\s\S]*?)<\/a>\s*<\/h3>[\s\S]*?(?:<p class="res-desc"[^>]*>([\s\S]*?)<\/p>)?/g)
  ];
  return blocks.map((m) => ({
    url: decodeHtmlEntities(m[2] || m[1]),
    title: stripHtml(m[3]),
    snippet: stripHtml(m[4] || '')
  }));
}

module.exports = {
  clampTopK,
  buildSearchQueryVariants,
  dedupeResults,
  normalizeWebSearchPayload,
  parseDuckDuckGoResults,
  parseBingResults,
  parseSoResults,
  rankRelevantResults
};
