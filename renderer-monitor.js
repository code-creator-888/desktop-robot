(function () {
  const { appendTextElement, appendButton } = window.RobotDOM;

  function renderProcessList(listId, processes) {
    const el = document.getElementById(listId);
    if (!el || !Array.isArray(processes)) return;
    el.innerHTML = '';
    processes.forEach(p => {
      const row = document.createElement('div');
      row.className = 'proc-row';
      appendTextElement(row, 'span', 'proc-col-cmd', p.cmd, { title: `${p.cmd} [${p.pid}]` });
      appendTextElement(row, 'span', 'proc-col-cpu', p.cpu);
      appendTextElement(row, 'span', 'proc-col-mem', p.mem);
      appendTextElement(row, 'span', 'proc-col-pid', p.pid);
      el.appendChild(row);
    });
  }

  function renderWatchedPorts(data, handlers = {}) {
    const list = document.getElementById('port-watched-list');
    if (!list) return;
    list.innerHTML = '';

    for (const port of data.ports) {
      const processes = data.portMap[port] || [];
      const item = document.createElement('div');
      item.className = 'port-item';

      const header = document.createElement('div');
      header.className = 'port-item-header';
      appendTextElement(header, 'span', 'port-item-number', `:${port}`);

      const actions = document.createElement('div');
      actions.className = 'port-item-actions';
      appendTextElement(
        actions,
        'span',
        processes.length > 0 ? 'port-badge occupied' : 'port-badge free',
        processes.length > 0 ? `占用 ${processes.length}` : '空闲'
      );
      appendButton(actions, 'port-remove-btn', '✕', { port }, '移除');
      header.appendChild(actions);
      item.appendChild(header);

      processes.forEach(proc => {
        const row = document.createElement('div');
        row.className = 'port-process-row';
        appendTextElement(row, 'span', 'port-proc-cmd', proc.command, { title: proc.command });
        appendTextElement(row, 'span', 'port-proc-addr', proc.addr);
        appendTextElement(row, 'span', 'port-proc-pid', `PID ${proc.pid}`);
        appendButton(row, 'port-kill-btn', 'Kill', { pid: proc.pid, cmd: proc.command });
        item.appendChild(row);
      });

      list.appendChild(item);
    }

    list.querySelectorAll('.port-remove-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const port = parseInt(btn.dataset.port, 10);
        if (handlers.removePort) await handlers.removePort(port);
      });
    });

    list.querySelectorAll('.port-kill-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pid = parseInt(btn.dataset.pid, 10);
        if (handlers.killProcess) await handlers.killProcess(pid);
      });
    });
  }

  function renderAllPorts(data) {
    const summary = document.getElementById('all-ports-summary');
    const list = document.getElementById('all-ports-list');
    if (!summary || !list) return;

    summary.textContent = `共 ${data.allCount} 个监听端口，显示前 ${data.allListening.length} 个`;
    list.innerHTML = '';

    data.allListening.forEach(p => {
      const row = document.createElement('div');
      row.className = 'all-port-row';
      appendTextElement(row, 'span', 'all-port-num', p.port);
      appendTextElement(row, 'span', 'all-port-cmd', p.command, { title: p.command });
      appendTextElement(row, 'span', 'all-port-addr', p.addr);
      appendTextElement(row, 'span', 'all-port-user', p.user);
      appendTextElement(row, 'span', 'all-port-pid', p.pid);
      list.appendChild(row);
    });
  }

  window.RobotMonitor = {
    renderProcessList,
    renderWatchedPorts,
    renderAllPorts
  };
})();
