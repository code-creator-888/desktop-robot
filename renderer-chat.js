(function () {
  const MAX_SESSIONS = 10;
  const SESSIONS_KEY = 'chatSessions';
  const LAST_SESSION_KEY = 'lastSessionId';

  function createChatController(deps) {
    const {
      elements,
      appendTextElement,
      stopIdleAnimations,
      resumeIdleAnimationsIfAllowed,
      setMouseCapture,
      updateMouseCapture,
      setChatOpen,
      isChatOpen,
      isThinking,
      setThinking,
      render,
      showSpeech,
      getSettings,
      openSettings,
      getSystemPrompt
    } = deps;
    const { chatPanel, chatMessages, chatInput, chatSend, chatClose } = elements;

    let chatMessagesList = [];
    let currentSessionId = null;
    let activeChatRequestId = '';
    const cancelledChatRequestIds = new Set();

    function createChatRequestId() {
      return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }

    function cancelActiveChatRequest() {
      if (!activeChatRequestId) return;
      cancelledChatRequestIds.add(activeChatRequestId);
      window.electronAPI.cancelChat(activeChatRequestId).catch(() => {});
      activeChatRequestId = '';
      setThinking(false);
    }

    function isChatRequestCancelled(requestId) {
      return !requestId || cancelledChatRequestIds.has(requestId) || activeChatRequestId !== requestId;
    }

    function formatDirectSearchResults(question, results) {
      const lines = [`我联网查到这些结果，可先直接参考：`, `问题：${question}`];
      (results || []).forEach((item, index) => {
        lines.push('');
        lines.push(`${index + 1}. ${item.title}`);
        if (item.snippet) lines.push(item.snippet);
        lines.push(item.url);
      });
      return lines.join('\n');
    }

    function shouldPreferWebSearch(text) {
      const normalized = String(text || '').trim().toLowerCase();
      if (!normalized) return false;
      return /(什么时候|何时|几点|今日|今天|最新|刚刚|目前|现在|近期|近况|上市|发布|发布日期|发售|开售|价格|多少钱|进展|动态|时间表|官网|新闻|销量|月销量)/.test(normalized);
    }

    function extractEmbeddedWebSearchQuery(content, fallbackQuery) {
      const text = String(content || '');
      if (!/functions\.webSearch/i.test(text)) return '';

      const jsonMatch = text.match(/<tool_call_argument_begin>\s*(\{[\s\S]*?\})\s*<tool_call_end>/i);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1]);
          const query = String(parsed?.query || '').trim();
          return query || String(fallbackQuery || '').trim();
        } catch {}
      }

      const inlineMatch = text.match(/functions\.webSearch(?::\d+)?[\s\S]*?"query"\s*:\s*"([^"]+)"/i);
      if (inlineMatch) return inlineMatch[1].trim();

      return String(fallbackQuery || '').trim();
    }

    async function tryWebSearchAnswer(text, settings, searchingMsg, requestId = '') {
      if (isChatRequestCancelled(requestId)) return { success: false, cancelled: true };
      const searchingIndex = chatMessagesList.length;
      chatMessagesList.push({ role: 'assistant', content: searchingMsg });
      renderChatMessages();

      const searchResult = await window.electronAPI.webSearch({
        query: text,
        topK: settings.webSearchTopK
      });

      if (isChatRequestCancelled(requestId)) {
        chatMessagesList.splice(searchingIndex, 1);
        renderChatMessages();
        return { success: false, cancelled: true };
      }

      if (!searchResult.success) {
        chatMessagesList.splice(searchingIndex, 1);
        renderChatMessages();
        return { success: false, error: searchResult.error };
      }

      const evidence = (searchResult.results || []).map((item, index) =>
        `${index + 1}. ${item.title}\n${item.snippet}\n${item.url}`
      ).join('\n\n');
      const summarizeResult = await window.electronAPI.chat({
        requestId,
        baseUrl: settings.baseUrl,
        model: settings.model,
        apiKey: settings.apiKey,
        provider: settings.provider,
        messages: [
          { role: 'system', content: '你是检索总结助手。请根据证据回答问题，并在结尾附上来源链接。' },
          { role: 'user', content: `用户问题：${text}\n\n证据：\n${evidence}\n\n请给出简洁结论并列出来源链接。` }
        ]
      });

      if (isChatRequestCancelled(requestId)) {
        chatMessagesList.splice(searchingIndex, 1);
        renderChatMessages();
        return { success: false, cancelled: true };
      }

      if (summarizeResult.success) {
        chatMessagesList[searchingIndex] = { role: 'assistant', content: summarizeResult.content };
        renderChatMessages();
        if (!isChatOpen()) showSpeech(summarizeResult.content, 4000);
        return { success: true };
      }

      const directResults = formatDirectSearchResults(text, searchResult.results || []);
      chatMessagesList[searchingIndex] = { role: 'assistant', content: `${directResults}\n\n（自动总结失败：${summarizeResult.error}）` };
      renderChatMessages();
      if (!isChatOpen()) showSpeech('联网搜索成功，但自动总结失败，已直接展示结果。', 3500);
      return { success: true };
    }

    function loadSessions() {
      try { return JSON.parse(localStorage.getItem(SESSIONS_KEY)) || []; } catch { return []; }
    }

    function saveSessions(sessions) {
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    }

    function saveCurrentSession() {
      if (!currentSessionId || chatMessagesList.length === 0) {
        if (currentSessionId) localStorage.setItem(LAST_SESSION_KEY, currentSessionId);
        return;
      }
      let sessions = loadSessions();
      const idx = sessions.findIndex(s => s.id === currentSessionId);
      const preview = chatMessagesList[chatMessagesList.length - 1]?.content?.slice(0, 30) || '';
      if (idx >= 0) {
        sessions[idx].messages = chatMessagesList;
        sessions[idx].preview = preview;
        sessions[idx].updatedAt = Date.now();
      } else {
        sessions.unshift({ id: currentSessionId, messages: chatMessagesList, preview, createdAt: currentSessionId, updatedAt: Date.now() });
      }
      sessions.sort((a, b) => b.updatedAt - a.updatedAt);
      if (sessions.length > MAX_SESSIONS) sessions = sessions.slice(0, MAX_SESSIONS);
      saveSessions(sessions);
      localStorage.setItem(LAST_SESSION_KEY, currentSessionId);
    }

    function startNewSession() {
      cancelActiveChatRequest();
      saveCurrentSession();
      currentSessionId = Date.now();
      chatMessagesList = [];
      localStorage.setItem(LAST_SESSION_KEY, currentSessionId);
    }

    function switchToSession(id) {
      if (currentSessionId === id) return;
      cancelActiveChatRequest();
      saveCurrentSession();
      const sessions = loadSessions();
      const session = sessions.find(s => s.id === id);
      if (!session) return;
      currentSessionId = session.id;
      chatMessagesList = session.messages || [];
      localStorage.setItem(LAST_SESSION_KEY, currentSessionId);
    }

    function initSession() {
      const lastId = parseInt(localStorage.getItem(LAST_SESSION_KEY), 10);
      if (lastId) {
        const sessions = loadSessions();
        const last = sessions.find(s => s.id === lastId);
        if (last) {
          currentSessionId = last.id;
          chatMessagesList = last.messages || [];
          return;
        }
      }
      currentSessionId = Date.now();
      chatMessagesList = [];
    }

    function openChat() {
      setChatOpen(true);
      stopIdleAnimations();
      chatPanel.classList.remove('hidden');
      setMouseCapture(true);
      initSession();
      renderSessionBar();
      renderChatMessages();
      chatInput.focus();
    }

    function closeChat() {
      cancelActiveChatRequest();
      saveCurrentSession();
      setChatOpen(false);
      chatPanel.classList.add('hidden');
      resumeIdleAnimationsIfAllowed();
      updateMouseCapture();
    }

    function renderChatMessages() {
      chatMessages.innerHTML = '';
      chatMessagesList.forEach((msg) => {
        const div = document.createElement('div');
        div.className = 'chat-message ' + (msg.role === 'user' ? 'user' : 'pet');
        div.textContent = msg.content;
        chatMessages.appendChild(div);
      });

      if (isThinking()) {
        const div = document.createElement('div');
        div.className = 'chat-message pet thinking-msg';
        div.textContent = '思考中...';
        chatMessages.appendChild(div);
      }

      chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function renderSessionBar() {
      const bar = document.getElementById('chat-session-bar');
      if (!bar) return;
      const sessions = loadSessions();
      const date = currentSessionId ? new Date(currentSessionId).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
      const msgCount = chatMessagesList.length;

      bar.innerHTML = '';

      const info = document.createElement('span');
      info.className = 'session-info';
      info.textContent = msgCount > 0 ? `${date} · ${Math.floor(msgCount / 2)}条` : '新对话';
      bar.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'session-actions';

      if (sessions.length > 0) {
        const histBtn = document.createElement('button');
        histBtn.className = 'session-btn';
        histBtn.title = '历史对话';
        histBtn.textContent = '历史';
        histBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleSessionList(bar, sessions);
        });
        actions.appendChild(histBtn);
      }

      const newBtn = document.createElement('button');
      newBtn.className = 'session-btn session-btn-new';
      newBtn.title = '新建对话';
      newBtn.textContent = '+ 新建';
      newBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeSessionList();
        startNewSession();
        renderSessionBar();
        renderChatMessages();
        chatInput.focus();
      });
      actions.appendChild(newBtn);
      bar.appendChild(actions);
    }

    function deleteSession(id) {
      let sessions = loadSessions();
      sessions = sessions.filter(s => s.id !== id);
      saveSessions(sessions);

      if (currentSessionId === id) {
        cancelActiveChatRequest();
        if (sessions.length > 0) {
          currentSessionId = sessions[0].id;
          chatMessagesList = sessions[0].messages || [];
          localStorage.setItem(LAST_SESSION_KEY, currentSessionId);
        } else {
          currentSessionId = Date.now();
          chatMessagesList = [];
          localStorage.setItem(LAST_SESSION_KEY, currentSessionId);
        }
        renderChatMessages();
      }

      renderSessionBar();
      const bar = document.getElementById('chat-session-bar');
      if (sessions.length > 0) {
        toggleSessionList(bar, sessions);
      }
    }

    function toggleSessionList(bar, sessions) {
      const existing = document.getElementById('session-list-dropdown');
      if (existing) { existing.remove(); return; }

      const dropdown = document.createElement('div');
      dropdown.id = 'session-list-dropdown';

      sessions.forEach(s => {
        const item = document.createElement('div');
        item.className = 'session-list-item' + (s.id === currentSessionId ? ' active' : '');

        const info = document.createElement('div');
        info.className = 'session-item-info';
        const d = new Date(s.id).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        appendTextElement(info, 'span', 'session-item-date', d);
        appendTextElement(info, 'span', 'session-item-preview', s.preview || '空对话');
        info.addEventListener('click', () => {
          switchToSession(s.id);
          closeSessionList();
          renderSessionBar();
          renderChatMessages();
        });

        const delBtn = document.createElement('button');
        delBtn.className = 'session-item-delete';
        delBtn.title = '删除';
        delBtn.textContent = '✕';
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteSession(s.id);
        });

        item.appendChild(info);
        item.appendChild(delBtn);
        dropdown.appendChild(item);
      });

      bar.parentElement.insertBefore(dropdown, bar.nextSibling);

      const onOutside = (e) => {
        if (!dropdown.contains(e.target) && e.target.closest('#chat-session-bar') === null) {
          closeSessionList();
          document.removeEventListener('click', onOutside);
        }
      };
      setTimeout(() => document.addEventListener('click', onOutside), 0);
    }

    function closeSessionList() {
      const el = document.getElementById('session-list-dropdown');
      if (el) el.remove();
    }

    async function sendMessage() {
      const text = chatInput.value.trim();
      if (!text || isThinking()) return;

      const settings = getSettings();
      if (!settings || !settings.baseUrl || !settings.model || !settings.apiKey) {
        openSettings();
        return;
      }

      chatInput.value = '';
      chatMessagesList.push({ role: 'user', content: text });
      renderChatMessages();

      setThinking(true);
      const requestId = createChatRequestId();
      const requestSessionId = currentSessionId;
      activeChatRequestId = requestId;
      render();

      try {
        if (settings.autoWebFallback && shouldPreferWebSearch(text)) {
          const webFirstResult = await tryWebSearchAnswer(text, settings, '这是时效性问题，我先联网搜索一下...', requestId);
          if (webFirstResult.cancelled) return;
          if (webFirstResult.success) return;
        }

        const messages = [
          { role: 'system', content: getSystemPrompt() },
          ...chatMessagesList.slice(-10)
        ];

        const result = await window.electronAPI.chat({
          requestId,
          baseUrl: settings.baseUrl,
          model: settings.model,
          apiKey: settings.apiKey,
          provider: settings.provider,
          messages
        });

        if (isChatRequestCancelled(requestId)) return;

        if (result.success) {
          const embeddedWebSearchQuery = settings.autoWebFallback
            ? extractEmbeddedWebSearchQuery(result.content, text)
            : '';
          if (embeddedWebSearchQuery) {
            const toolCallResult = await tryWebSearchAnswer(embeddedWebSearchQuery, settings, '检测到联网搜索指令，正在执行...', requestId);
            if (toolCallResult.cancelled) return;
            if (toolCallResult.success) return;
          }
          chatMessagesList.push({ role: 'assistant', content: result.content });
          renderChatMessages();
          if (!isChatOpen()) showSpeech(result.content, 4000);
        } else {
          if (settings.autoWebFallback) {
            const fallbackResult = await tryWebSearchAnswer(text, settings, '主回答失败，正在联网搜索并总结...', requestId);
            if (fallbackResult.cancelled) return;
            if (!fallbackResult.success) {
              const combinedError = `出错了：${result.error}；联网搜索失败：${fallbackResult.error}`;
              chatMessagesList.push({ role: 'assistant', content: combinedError });
              renderChatMessages();
              if (!isChatOpen()) showSpeech(combinedError, 3000);
            } else {
              const latestReply = chatMessagesList[chatMessagesList.length - 1];
              if (latestReply && latestReply.role === 'assistant' && latestReply.content.includes('自动总结失败：')) {
                latestReply.content = `${latestReply.content.slice(0, -1)}；主回答失败：${result.error}）`;
                renderChatMessages();
              }
            }
          } else {
            const errMsg = '出错了：' + result.error;
            chatMessagesList.push({ role: 'assistant', content: errMsg });
            renderChatMessages();
            if (!isChatOpen()) showSpeech(errMsg, 3000);
          }
        }
      } finally {
        cancelledChatRequestIds.delete(requestId);
        if (activeChatRequestId === requestId) activeChatRequestId = '';
        setThinking(false);
        if (currentSessionId === requestSessionId) {
          saveCurrentSession();
          renderSessionBar();
        }
        render();
      }
    }

    function appendTranslateMessage(content) {
      const div = document.createElement('div');
      div.className = 'chat-message translate-msg';
      div.textContent = content;
      chatMessages.appendChild(div);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function bindChatEvents() {
      chatSend.addEventListener('click', sendMessage);
      chatClose.addEventListener('click', closeChat);
      chatInput.addEventListener('keydown', (e) => {
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === 'Enter') sendMessage();
      });
    }

    return {
      bindChatEvents,
      openChat,
      closeChat,
      sendMessage,
      appendTranslateMessage,
      saveCurrentSession
    };
  }

  window.RobotChat = {
    createChatController
  };
})();
