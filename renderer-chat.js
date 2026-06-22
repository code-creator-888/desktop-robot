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

    function loadSessions() {
      try { return JSON.parse(localStorage.getItem(SESSIONS_KEY)) || []; } catch { return []; }
    }

    function saveSessions(sessions) {
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    }

    function saveCurrentSession() {
      if (!currentSessionId || chatMessagesList.length === 0) return;
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
      saveCurrentSession();
      currentSessionId = Date.now();
      chatMessagesList = [];
    }

    function switchToSession(id) {
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
        if (sessions.length > 0) {
          switchToSession(sessions[0].id);
        } else {
          startNewSession();
          chatMessagesList = [];
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
      render();

      try {
        const messages = [
          { role: 'system', content: getSystemPrompt() },
          ...chatMessagesList.slice(-10)
        ];

        const result = await window.electronAPI.chat({
          baseUrl: settings.baseUrl,
          model: settings.model,
          apiKey: settings.apiKey,
          provider: settings.provider,
          messages
        });

        if (result.success) {
          chatMessagesList.push({ role: 'assistant', content: result.content });
          renderChatMessages();
          if (!isChatOpen()) showSpeech(result.content, 4000);
        } else {
          if (settings.autoWebFallback) {
            const searchingMsg = '主回答失败，正在联网搜索并总结...';
            const searchingIndex = chatMessagesList.length;
            chatMessagesList.push({ role: 'assistant', content: searchingMsg });
            renderChatMessages();

            const searchResult = await window.electronAPI.webSearch({
              query: text,
              topK: settings.webSearchTopK
            });

            if (searchResult.success) {
              const evidence = (searchResult.results || []).map((item, index) =>
                `${index + 1}. ${item.title}\n${item.snippet}\n${item.url}`
              ).join('\n\n');
              const summarizeResult = await window.electronAPI.chat({
                baseUrl: settings.baseUrl,
                model: settings.model,
                apiKey: settings.apiKey,
                provider: settings.provider,
                messages: [
                  { role: 'system', content: '你是检索总结助手。请根据证据回答问题，并在结尾附上来源链接。' },
                  { role: 'user', content: `用户问题：${text}\n\n证据：\n${evidence}\n\n请给出简洁结论并列出来源链接。` }
                ]
              });

              if (summarizeResult.success) {
                chatMessagesList[searchingIndex] = { role: 'assistant', content: summarizeResult.content };
                renderChatMessages();
                if (!isChatOpen()) showSpeech(summarizeResult.content, 4000);
              } else {
                const combinedError = `出错了：${result.error}；联网搜索成功，但总结失败：${summarizeResult.error}`;
                chatMessagesList[searchingIndex] = { role: 'assistant', content: combinedError };
                renderChatMessages();
                if (!isChatOpen()) showSpeech(combinedError, 3000);
              }
            } else {
              const combinedError = `出错了：${result.error}；联网搜索失败：${searchResult.error}`;
              chatMessagesList[searchingIndex] = { role: 'assistant', content: combinedError };
              renderChatMessages();
              if (!isChatOpen()) showSpeech(combinedError, 3000);
            }
          } else {
            const errMsg = '出错了：' + result.error;
            chatMessagesList.push({ role: 'assistant', content: errMsg });
            renderChatMessages();
            if (!isChatOpen()) showSpeech(errMsg, 3000);
          }
        }
      } finally {
        setThinking(false);
        saveCurrentSession();
        renderSessionBar();
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
