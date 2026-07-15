(function () {
  const TODO_STORAGE_KEY = 'todoItems';

  function createTodoController(deps) {
    const {
      elements,
      dom,
      setMouseCapture,
      stopIdleAnimations,
      resumeIdleAnimationsIfAllowed,
      updateMouseCapture,
      setTodoOpen
    } = deps;
    const { todoList, todoListClose, todoAddTitle, todoAddDue, todoAddBtn, todoItemsEl } = elements;
    const { appendTextElement, appendButton } = dom;

    let todoItems = [];
    let editingDueId = null;
    let countdownInterval = null;

    function loadTodoItems() {
      try {
        const raw = localStorage.getItem(TODO_STORAGE_KEY);
        if (!raw) return [];
        const items = JSON.parse(raw);
        if (!Array.isArray(items)) return [];
        return items
          .filter((item) => item && item.id && item.title)
          .map((item) => ({ ...item, dueAt: item.dueAt || null }));
      } catch {
        return [];
      }
    }

    function saveTodoItems() {
      localStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(todoItems));
    }

    function isoToLocalInput(iso) {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      const pad = (n) => String(n).padStart(2, '0');
      return (
        d.getFullYear() +
        '-' +
        pad(d.getMonth() + 1) +
        '-' +
        pad(d.getDate()) +
        'T' +
        pad(d.getHours()) +
        ':' +
        pad(d.getMinutes())
      );
    }

    function formatDueDate(iso) {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '-';
      return d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    function formatCountdown(ms) {
      if (ms <= 0) return '已截止';
      const totalSec = Math.floor(ms / 1000);
      const d = Math.floor(totalSec / 86400);
      const h = Math.floor((totalSec % 86400) / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      if (d > 0) return d + '天 ' + h + '小时';
      if (h > 0) return h + '小时 ' + m + '分';
      if (m > 0) return m + '分 ' + s + '秒';
      return s + '秒';
    }

    function renderTodoList() {
      if (!todoItemsEl) return;
      todoItemsEl.innerHTML = '';
      const sorted = [...todoItems].sort((a, b) => {
        if (a.status !== b.status) return a.status === 'done' ? 1 : -1;
        if (a.dueAt && b.dueAt) return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
        if (a.dueAt) return -1;
        if (b.dueAt) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      sorted.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'todo-item' + (item.status === 'done' ? ' done' : '');

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'todo-item-checkbox';
        checkbox.checked = item.status === 'done';
        checkbox.dataset.id = item.id;
        row.appendChild(checkbox);

        const main = document.createElement('div');
        main.className = 'todo-item-main';
        appendTextElement(main, 'div', 'todo-item-title', item.title);

        if (editingDueId === item.id) {
          const dueInput = document.createElement('input');
          dueInput.type = 'datetime-local';
          dueInput.className = 'todo-due-edit-input';
          dueInput.value = item.dueAt ? isoToLocalInput(item.dueAt) : '';
          main.appendChild(dueInput);

          appendButton(main, 'todo-due-save-btn', '保存', { id: item.id });
          appendButton(main, 'todo-due-clear-btn', '清除DDL', { id: item.id });
        } else if (item.dueAt) {
          const dueEl = document.createElement('div');
          dueEl.className = 'todo-item-due';
          dueEl.textContent = '⏰ ' + formatDueDate(item.dueAt);
          main.appendChild(dueEl);

          if (item.status !== 'done') {
            const countdown = document.createElement('div');
            countdown.className = 'todo-countdown';
            countdown.dataset.dueTs = String(new Date(item.dueAt).getTime());
            main.appendChild(countdown);
          }

          appendButton(main, 'todo-due-edit-btn', '改DDL', { id: item.id });
        } else {
          appendButton(main, 'todo-due-edit-btn', '设DDL', { id: item.id });
        }

        row.appendChild(main);

        const actions = document.createElement('div');
        actions.className = 'todo-item-actions';
        appendButton(actions, 'todo-delete-btn', '删除', { id: item.id });
        row.appendChild(actions);

        todoItemsEl.appendChild(row);
      });

      todoItemsEl.querySelectorAll('.todo-item-checkbox').forEach((checkbox) => {
        checkbox.addEventListener('change', () => {
          toggleTodoDone(checkbox.dataset.id);
        });
      });

      todoItemsEl.querySelectorAll('.todo-delete-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          deleteTodoItem(btn.dataset.id);
        });
      });

      todoItemsEl.querySelectorAll('.todo-due-edit-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          editingDueId = btn.dataset.id;
          renderTodoList();
        });
      });

      todoItemsEl.querySelectorAll('.todo-due-save-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.id;
          const row = btn.closest('.todo-item');
          const input = row.querySelector('.todo-due-edit-input');
          const raw = input.value;
          setTodoDueDate(id, raw ? new Date(raw).toISOString() : null);
        });
      });

      todoItemsEl.querySelectorAll('.todo-due-clear-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          setTodoDueDate(btn.dataset.id, null);
        });
      });

      updateCountdowns();
    }

    function updateCountdowns() {
      if (!todoItemsEl) return;
      const now = Date.now();
      todoItemsEl.querySelectorAll('.todo-countdown').forEach((el) => {
        const ts = Number(el.dataset.dueTs);
        if (!ts || Number.isNaN(ts)) {
          el.textContent = '';
          return;
        }
        const remaining = ts - now;
        el.textContent = '⏳ ' + formatCountdown(remaining);
        el.classList.toggle('countdown-urgent', remaining > 0 && remaining <= 60 * 60 * 1000);
        el.classList.toggle('countdown-overdue', remaining <= 0);
      });
    }

    function startCountdownTicker() {
      stopCountdownTicker();
      updateCountdowns();
      countdownInterval = setInterval(updateCountdowns, 1000);
    }

    function stopCountdownTicker() {
      if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
    }

    function addTodoItem() {
      const title = todoAddTitle.value.trim();
      if (!title) return;
      const dueRaw = todoAddDue ? todoAddDue.value : '';
      const dueAt = dueRaw ? new Date(dueRaw).toISOString() : null;
      todoItems.push({
        id: Date.now().toString() + Math.random().toString(16).slice(2, 8),
        title,
        status: 'pending',
        createdAt: new Date().toISOString(),
        completedAt: null,
        dueAt
      });
      saveTodoItems();
      renderTodoList();
      todoAddTitle.value = '';
      if (todoAddDue) todoAddDue.value = '';
    }

    function toggleTodoDone(id) {
      const item = todoItems.find((x) => x.id === id);
      if (!item) return;
      item.status = item.status === 'done' ? 'pending' : 'done';
      item.completedAt = item.status === 'done' ? new Date().toISOString() : null;
      saveTodoItems();
      renderTodoList();
    }

    function deleteTodoItem(id) {
      todoItems = todoItems.filter((x) => x.id !== id);
      saveTodoItems();
      renderTodoList();
    }

    function setTodoDueDate(id, isoOrNull) {
      const item = todoItems.find((x) => x.id === id);
      if (!item) return;
      item.dueAt = isoOrNull;
      editingDueId = null;
      saveTodoItems();
      renderTodoList();
    }

    function openTodoList() {
      setTodoOpen(true);
      stopIdleAnimations();
      todoList.classList.remove('hidden');
      setMouseCapture(true);
      renderTodoList();
      startCountdownTicker();
    }

    function closeTodoList() {
      setTodoOpen(false);
      stopCountdownTicker();
      editingDueId = null;
      todoList.classList.add('hidden');
      resumeIdleAnimationsIfAllowed();
      updateMouseCapture();
    }

    function bindTodoEvents() {
      todoListClose.addEventListener('click', closeTodoList);
      todoList.querySelector('.monitor-backdrop').addEventListener('click', closeTodoList);
      todoAddBtn.addEventListener('click', addTodoItem);
      todoAddTitle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addTodoItem();
      });
    }

    function init() {
      todoItems = loadTodoItems();
    }

    return {
      init,
      bindTodoEvents,
      openTodoList,
      closeTodoList,
      addTodoItem,
      toggleTodoDone,
      deleteTodoItem,
      setTodoDueDate
    };
  }

  window.RobotTodo = {
    createTodoController
  };
})();
