(function () {
  function appendTextElement(parent, tagName, className, text, attributes = {}) {
    const el = document.createElement(tagName);
    if (className) el.className = className;
    el.textContent = text == null ? '' : String(text);
    Object.entries(attributes).forEach(([key, value]) => {
      el.setAttribute(key, String(value));
    });
    parent.appendChild(el);
    return el;
  }

  function appendButton(parent, className, text, dataset = {}, title = '') {
    const btn = document.createElement('button');
    btn.className = className;
    btn.textContent = text;
    if (title) btn.title = title;
    Object.entries(dataset).forEach(([key, value]) => {
      btn.dataset[key] = String(value);
    });
    parent.appendChild(btn);
    return btn;
  }

  function appendReminderRuleOptions(select, selectedType) {
    [
      ['one-time', '仅一次'],
      ['daily', '每天'],
      ['weekly', '每周'],
      ['workday', '工作日']
    ].forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      option.selected = value === selectedType;
      select.appendChild(option);
    });
  }

  window.RobotDOM = {
    appendTextElement,
    appendButton,
    appendReminderRuleOptions
  };
})();
