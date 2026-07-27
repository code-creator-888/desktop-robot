(function () {
  const TRANSLATION_FALLBACKS = {
    diff: '差异'
  };

  function createTranslateController(deps) {
    const { getTranslateModelConfig, showSpeech, appendTranslateMessage } = deps;

    function containsChinese(text) {
      return /[\u4e00-\u9fff]/.test(text || '');
    }

    function needsChineseExplainRepair(inputText, outputText) {
      if (!containsChinese(inputText)) return false;
      const out = (outputText || '').trim();
      if (!out) return true;
      const tonePinyinPattern = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/;
      const compactChinesePattern = /（[^）]+）：.+/;
      return !(compactChinesePattern.test(out) && tonePinyinPattern.test(out));
    }

    function needsEnglishTranslateRepair(inputText, outputText) {
      if (containsChinese(inputText)) return false;
      const out = (outputText || '').trim();
      if (!out) return true;
      if (/Analyze the Request|Role:|Task:|Constraints:|Input text|Output exactly one line/i.test(out)) {
        return true;
      }
      return !containsChinese(out);
    }

    function getEnglishTranslateFallback(inputText) {
      const key = (inputText || '').trim().toLowerCase();
      if (TRANSLATION_FALLBACKS[key]) return `${inputText.trim()}：${TRANSLATION_FALLBACKS[key]}`;
      return '';
    }

    function formatTranslateError(error) {
      const msg = error || '未知错误';
      if (msg === 'Model returned reasoning only without final content') {
        return '模型只返回了思考过程，未返回最终译文';
      }
      if (msg === 'Empty model response') {
        return '模型返回为空';
      }
      return msg;
    }

    function formatEnglishTranslationResult(inputText, outputText) {
      const source = (inputText || '').trim();
      if (!source) return (outputText || '').trim();

      let out = (outputText || '').replace(/\s+/g, ' ').trim();
      if (!out) return `${source}：`;

      out = out.replace(/^["“”'`]+|["“”'`]+$/g, '');
      out = out.replace(/^(翻译|译文|中文翻译|结果)\s*[：:]\s*/i, '');

      const pair = out.match(/^(.+?)[：:]\s*(.+)$/);
      if (pair) {
        const left = pair[1].trim();
        const right = pair[2].trim();
        const normalizedLeft = left
          .replace(/\s*\([^)]*\)\s*/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();
        if (normalizedLeft === source.toLowerCase() || /^[A-Za-z0-9 _./()-]+$/.test(left)) {
          out = right;
        }
      }

      return `${source}：${out}`;
    }

    async function handleTranslateSelection(text) {
      if (!text) {
        showSpeech('请先 Cmd+C 复制文字', 2500);
        return;
      }

      const translateConfig = getTranslateModelConfig();
      if (!translateConfig || !translateConfig.baseUrl || !translateConfig.model || !translateConfig.apiKey) {
        showSpeech('请先配置翻译模型', 2000);
        return;
      }

      showSpeech('翻译中…', 0);

      const isChineseInput = containsChinese(text);
      const prompt = isChineseInput
        ? `你是一个精准的中文解释助手。请严格输出：中文词（带声调拼音）：中文解释

输出要求：
- 只输出一行结果，不要额外说明
- 必须同时包含拼音和解释，拼音放在全角括号中并带声调（如 cèshì）
- 统一使用中文冒号“：”

中文示例：测试（cèshì）：用于验证功能是否正常

原文："""${text}"""`
        : `你是一个精准的翻译助手。请把以下英文或外语翻译成中文，并严格输出：英文原词：中文翻译

输出要求：
- 只输出一行结果，不要额外说明
- 必须包含中文译文，不能留空，不能只输出原文
- 统一使用中文冒号“：”

英文示例：diff：差异

原文："""${text}"""`;

      try {
        const result = await window.electronAPI.chat({
          baseUrl: translateConfig.baseUrl,
          model: translateConfig.model,
          apiKey: translateConfig.apiKey,
          provider: translateConfig.provider,
          maxTokens: 1024,
          messages: [{ role: 'user', content: prompt }]
        });

        if (result.success) {
          let reply = result.content;
          if (needsChineseExplainRepair(text, reply)) {
            const repairPrompt = `你上一条输出格式不符合要求。请仅按以下格式重写，不要添加其他内容：
中文词（带声调拼音）：中文解释

要求：
- 使用中文冒号“：”
- 拼音必须带声调（如 cèshì）

原文："""${text}"""
你上一条输出："""${reply}"""`;
            const repaired = await window.electronAPI.chat({
              baseUrl: translateConfig.baseUrl,
              model: translateConfig.model,
              apiKey: translateConfig.apiKey,
              provider: translateConfig.provider,
              maxTokens: 1024,
              messages: [{ role: 'user', content: repairPrompt }]
            });
            if (repaired.success && repaired.content) {
              reply = repaired.content;
            }
          }
          if (needsEnglishTranslateRepair(text, reply)) {
            const repairPrompt = `你上一条没有给出中文翻译。请仅按以下格式重写，不要添加其他内容：
英文原词：中文翻译

要求：
- 必须包含中文译文
- 统一使用中文冒号“：”

原文："""${text}"""
你上一条输出："""${reply}"""`;
            const repaired = await window.electronAPI.chat({
              baseUrl: translateConfig.baseUrl,
              model: translateConfig.model,
              apiKey: translateConfig.apiKey,
              provider: translateConfig.provider,
              maxTokens: 1024,
              messages: [{ role: 'user', content: repairPrompt }]
            });
            if (repaired.success && repaired.content) {
              reply = repaired.content;
            }
          }
          if (!containsChinese(text)) {
            reply = formatEnglishTranslationResult(text, reply);
            if (!containsChinese(reply)) {
              const fallbackReply = getEnglishTranslateFallback(text);
              if (fallbackReply) {
                reply = fallbackReply;
              } else {
                showSpeech('翻译失败：模型未返回中文译文', 4000);
                return;
              }
            }
          }
          const preview = reply.replace(/\n+/g, ' ');
          showSpeech(preview, 10000);
          appendTranslateMessage(reply);
        } else {
          showSpeech(`翻译失败：${formatTranslateError(result.error)}`, 4000);
        }
      } catch (e) {
        showSpeech(`翻译出错：${formatTranslateError(e.message)}`, 4000);
      }
    }

    function bindTranslateEvents() {
      window.electronAPI.onTranslateSelection(handleTranslateSelection);
    }

    return {
      bindTranslateEvents,
      handleTranslateSelection,
      containsChinese,
      needsChineseExplainRepair,
      needsEnglishTranslateRepair,
      getEnglishTranslateFallback,
      formatTranslateError,
      formatEnglishTranslationResult
    };
  }

  window.RobotTranslate = {
    createTranslateController
  };
})();
