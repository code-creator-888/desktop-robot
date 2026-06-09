# Web Fallback Search Design

## Background

Current chat flow sends requests directly to the selected model. When model calls fail (timeout, upstream error, parsing error), users only receive an error message.  
Goal: automatically perform web search on model failure, then ask the same model to summarize search findings and return a final answer with source links.

## Scope

In scope:
- Auto fallback only when model request fails (`success=false`)
- Built-in public web search (no extra API key)
- Model-generated summary from search results
- Show 3-5 source links in final reply
- Minimal settings for fallback enablement and result count

Out of scope:
- RAG/vector database
- Advanced ranking, crawling, or long-term indexing
- Multi-model backup orchestration

## Approach (Approved)

Use a two-stage fallback pipeline:
1. Normal model chat request
2. If failed, trigger web search and then call the same model again to summarize search results

This keeps current architecture intact and minimizes invasive changes.

## Architecture Changes

### 1) Main process (`main.js`)

Add:
- `ipcMain.handle('web-search', async (event, { query, topK }))`

Responsibilities:
- Perform public search request(s)
- Normalize results into `{ title, snippet, url }[]`
- Deduplicate by URL
- Apply max item limit (`topK`, default 5)
- Apply timeout and return explicit error

Return shape:
- Success: `{ success: true, results: [...] }`
- Failure: `{ success: false, error: '...' }`

### 2) Renderer process (`renderer.js`)

Change `sendMessage()` failure branch:
- On initial chat failure:
  - Show temporary status message ("主模型失败，正在联网搜索...")
  - Call `window.electronAPI.webSearch({ query: userText, topK })`
  - Build fallback prompt from results
  - Call `window.electronAPI.chat(...)` again (same model/provider)
- If fallback summary succeeds:
  - Append summary text
  - Append 3-5 source links
- If fallback fails:
  - Return clear combined error including original model error + fallback error

### 3) Preload bridge (`preload.js`)

Expose:
- `webSearch(payload)` IPC wrapper

### 4) Settings

Extend stored settings with:
- `autoWebFallback: boolean` (default `true`)
- `webSearchTopK: number` (default `5`, clamp to 3-8)

## Data Flow

1. User sends message
2. Primary model request fails
3. Fallback search runs using user question as query
4. Search results are formatted into model context:
   - System instruction: summarize and cite
   - Evidence list: title/snippet/url
5. Same model produces final response
6. UI renders response + source links

## Error Handling

- Primary model failure: preserve original error text
- Search failure: surface `search_error` with short reason
- Fallback summary failure: surface `summarize_error`
- Final error format should remain user-readable, no raw stack traces

## Test Plan

1. Primary chat success: no fallback triggered
2. Primary chat failure + search success + summarize success: final answer includes summary and 3-5 links
3. Primary chat failure + search failure: explicit fallback failure message
4. Primary chat failure + search success + summarize failure: explicit summary failure message
5. Dedup logic: duplicate URLs are removed
6. `webSearchTopK` clamp works and defaults apply

## Rollout Notes

- Feature default enabled for better resilience
- Can be disabled in settings if users prefer strict offline/no-search behavior
