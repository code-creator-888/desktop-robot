# Desktop Robot

<div align="center">
  <img src="assets/robot.svg" alt="Desktop Robot" width="120">
  <br>
  <p>🤖 A cute desktop pet for macOS, built with Electron</p>
  <p>🤖 一个基于 Electron 构建的 macOS 桌面机器人宠物</p>
</div>

<p align="center">
  <a href="#english">English</a> | <a href="#中文">中文</a>
</p>

---

<h2 id="english">🇺🇸 English</h2>

### Features

- 🐾 **Cute Robot Pet** — A floating desktop robot that stays on top of all windows.
- 💬 **AI Chat** — Built-in chat panel powered by OpenAI-compatible / Anthropic APIs.
- 🌐 **Web Fallback** — If primary model call fails, automatically search the web and summarize with citations.
- 📊 **System Monitor** — Real-time CPU, memory, network, disk, and process monitoring.
- 🔌 **Port Monitor** — Watch specific ports and view all listening services.
- 🖱️ **Interactive** — Click the robot to open chat, right-click for system menu.
- 🎨 **Transparent UI** — Frameless, click-through when not interacting.

### Prerequisites

- macOS
- Node.js >= 18

### Install & Run

```bash
npm install
npm start
```

### Project Structure

```
desktop-robot/
├── main.js          # Electron main process
├── preload.js       # Preload script (secure bridge)
├── renderer.js      # UI logic & IPC communication
├── index.html       # Main window HTML
├── style.css        # Styles
├── package.json     # Dependencies
└── assets/          # Images & resources
```

### Tech Stack

- [Electron](https://www.electronjs.org/)
- [uiohook-napi](https://github.com/Sunrise-Studio/uiohook-napi) — Global input hooks

### License

MIT

---

<h2 id="中文">🇨🇳 中文</h2>

### 功能特性

- 🐾 **可爱机器人宠物** — 悬浮在所有窗口之上的桌面机器人。
- 💬 **AI 对话** — 支持 OpenAI 兼容 / Anthropic API 的内置聊天面板。
- 🌐 **联网回退** — 主模型调用失败时，自动网页搜索并生成带引用的总结回复。
- 📊 **系统监控** — 实时查看 CPU、内存、网络、磁盘及进程信息。
- 🔌 **端口监控** — 监控指定端口，查看当前所有监听服务。
- 🖱️ **交互式操作** — 点击机器人打开聊天，右键呼出系统菜单。
- 🎨 **透明界面** — 无边框窗口，非交互区域可穿透点击。

### 环境要求

- macOS
- Node.js >= 18

### 安装与运行

```bash
npm install
npm start
```

### 项目结构

```
desktop-robot/
├── main.js          # Electron 主进程
├── preload.js       # 预加载脚本（安全桥接）
├── renderer.js      # UI 逻辑与 IPC 通信
├── index.html       # 主窗口 HTML
├── style.css        # 样式
├── package.json     # 依赖
└── assets/          # 图片与资源
```

### 技术栈

- [Electron](https://www.electronjs.org/)
- [uiohook-napi](https://github.com/Sunrise-Studio/uiohook-napi) — 全局输入钩子

### 开源协议

MIT
